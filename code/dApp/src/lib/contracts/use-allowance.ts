import type { Data } from "@meshsdk/common";
import { buildWalletWitnessData } from "@/lib/contracts/action-data";
import {
  isConstrData,
  readBoolean,
  readInteger,
  readOptionalInteger,
  readWallets
} from "@/lib/contracts/plutus-primitives";
import { readStateSections } from "@/lib/contracts/state-layout";
import { unwrapStateDatum } from "@/lib/contracts/stt-datum";
import {
  parseValueData,
  partsToUnit,
  serializeValueEntries,
  splitAssetUnit,
  valueEntriesToAssets
} from "@/lib/contracts/value-data";
import type {
  Asset,
  ConstrData,
  PayoutTransfer,
  WalletScriptOutput
} from "@/lib/types/contracts";

const ALLOWANCE_DAY_MS = 86_400_000;

type ParsedAllowanceAsset = {
  policyId: string;
  assetName: string;
  amount: bigint;
};

type ParsedUser = {
  id: number;
  userWallets: string[];
  perDayAllowance: ParsedAllowanceAsset[];
  remainingAllowance: ParsedAllowanceAsset[];
  nextAllowanceReset: number;
  canRenewProofOfLife: boolean;
  isAdmin: boolean;
  raw: ConstrData;
};

type ParsedState = {
  users: ParsedUser[];
  proofOfLifeUnlockTime: number | null;
  proofOfLifeIncrement: number | null;
  accessRaw: ConstrData;
  proofOfLifeRaw: ConstrData;
  raw: ConstrData;
};

type MatchedUserCandidate = {
  parsedState: ParsedState;
  matchedUser: ParsedUser;
  matchedUserIndex: number;
  effectiveRemainingAllowance: ParsedAllowanceAsset[];
  nextAllowanceReset: number;
};

export type AllowanceWithdrawalTarget = {
  matchedUserId: number;
  matchedUserIndex: number;
  matchedUserWallets: string[];
  effectiveRemainingAllowance: Asset[];
  currentRemainingAllowance: Asset[];
  nextAllowanceReset: number;
};

export type AllowanceWithdrawalComputation = AllowanceWithdrawalTarget & {
  walletWitness: ConstrData;
  spentAllowance: Asset[];
  resultingRemainingAllowance: Asset[];
  outputDatum: ConstrData;
};

// Plutus-Data guards (isConstrData) and readers (readInteger/readByteArray/
// readBoolean/readOptionalInteger/readWallets) are imported from
// @/lib/contracts/plutus-primitives.

function readAllowanceValue(value: Data, label: string) {
  return parseValueData(value, label).map((entry, index) => {
    if (entry.amount < 0n) {
      throw new Error(`${label}[${index}].amount must be zero or greater.`);
    }

    return entry;
  });
}

function parseUser(value: Data, label: string): ParsedUser {
  if (!isConstrData(value) || value.alternative !== 0 || value.fields.length !== 8) {
    throw new Error(`${label} must be a User constructor.`);
  }

  const [
    id,
    userWallets,
    perDayAllowance,
    remainingAllowance,
    nextAllowanceReset,
    canRenewProofOfLife,
    ,
    isAdmin
  ] = value.fields;

  return {
    id: readInteger(id, `${label}.id`),
    userWallets: readWallets(userWallets, `${label}.user_wallets`),
    perDayAllowance: readAllowanceValue(
      perDayAllowance,
      `${label}.per_day_allowance`
    ),
    remainingAllowance: readAllowanceValue(
      remainingAllowance,
      `${label}.remaining_allowance`
    ),
    nextAllowanceReset: readInteger(
      nextAllowanceReset,
      `${label}.next_allowance_reset`
    ),
    canRenewProofOfLife: readBoolean(
      canRenewProofOfLife,
      `${label}.can_renew_proof_of_life`
    ),
    isAdmin: readBoolean(isAdmin, `${label}.is_admin`),
    raw: value
  };
}

function parseState(stateDatum: ConstrData): ParsedState {
  const unwrappedStateDatum = unwrapStateDatum(stateDatum, "State datum");
  const sections = readStateSections(unwrappedStateDatum, "State datum");

  return {
    users: sections.users.map((entry, index) => parseUser(entry, `state.users[${index}]`)),
    proofOfLifeUnlockTime: readOptionalInteger(
      sections.unlockTime,
      "state.proof_of_life_unlock_time"
    ),
    proofOfLifeIncrement: readOptionalInteger(
      sections.increment,
      "state.proof_of_life_increment"
    ),
    accessRaw: sections.access,
    proofOfLifeRaw: sections.proofOfLife,
    raw: unwrappedStateDatum
  };
}

function assetKey(policyId: string, assetName: string) {
  return `${policyId}.${assetName}`;
}

function normalizeAllowance(
  allowance: ParsedAllowanceAsset[],
  txEarliestTimeMs: number,
  txLatestTimeMs: number,
  nextAllowanceReset: number,
  perDayAllowance: ParsedAllowanceAsset[]
) {
  const minimumNextAllowanceReset = txLatestTimeMs + ALLOWANCE_DAY_MS;

  return {
    // The reset DECISION mirrors the on-chain rule
    // `lib/state/allowance.ak::remaining_allowance_available_for_use`, which
    // anchors to the tx LOWER bound: the per-day allowance only counts as reset
    // once the earliest slot this tx can land in has passed `next_allowance_reset`.
    // Anchoring to the upper bound (the previous behaviour) over-credits to
    // `per_day` in the window `earliest < reset <= latest`; the contract then
    // recomputes `spent` against the true (smaller) remaining and rejects the
    // transaction. This is the off-chain half of the security fix pinned by
    // `attack_allowance_reset_cannot_anchor_to_stale_lower_bound`.
    effectiveRemainingAllowance:
      nextAllowanceReset <= txEarliestTimeMs ? perDayAllowance : allowance,
    // The reset REBASE still uses the upper bound, matching
    // `next_allowance_reset_after_use`: the new deadline must clear the latest
    // slot this tx can land in by one full period.
    nextAllowanceReset:
      nextAllowanceReset > minimumNextAllowanceReset
        ? nextAllowanceReset
        : minimumNextAllowanceReset
  };
}

function sumAssetListsByUnit(amounts: Asset[][]): Asset[] {
  const totals = new Map<string, bigint>();

  for (const amountList of amounts) {
    for (const asset of amountList) {
      const unit = asset.unit === "" ? "lovelace" : asset.unit;
      const current = totals.get(unit) ?? 0n;
      totals.set(unit, current + BigInt(asset.quantity));
    }
  }

  return [...totals.entries()]
    .filter(([, quantity]) => quantity > 0n)
    .sort(([leftUnit], [rightUnit]) => {
      if (leftUnit === "lovelace") return -1;
      if (rightUnit === "lovelace") return 1;
      return leftUnit.localeCompare(rightUnit);
    })
    .map(([unit, quantity]) => ({
      unit,
      quantity: quantity.toString()
    }));
}

function ensureRequestedAssetsFitWithinInputs(
  walletInputAmounts: Asset[][],
  walletOutputs: WalletScriptOutput[],
  extraTransfers: PayoutTransfer[]
) {
  const availableByUnit = new Map<string, bigint>();
  const requestedByUnit = new Map<string, bigint>();

  for (const asset of sumAssetListsByUnit(walletInputAmounts)) {
    availableByUnit.set(asset.unit, BigInt(asset.quantity));
  }

  for (const asset of sumAssetListsByUnit([
    ...walletOutputs.map((output) => output.amount),
    ...extraTransfers.map((transfer) => transfer.amount)
  ])) {
    requestedByUnit.set(asset.unit, BigInt(asset.quantity));
  }

  for (const [unit, quantity] of requestedByUnit.entries()) {
    const available = availableByUnit.get(unit) ?? 0n;
    if (quantity > available) {
      throw new Error(
        `Requested locked-fund usage for ${unit} exceeds the selected wallet inputs.`
      );
    }
  }
}

function formatAllowanceAssets(assets: ParsedAllowanceAsset[]) {
  return valueEntriesToAssets(assets);
}

function toSpentAllowanceMap(spentAllowance: Asset[]) {
  const spentByKey = new Map<string, bigint>();

  for (const asset of spentAllowance) {
    const quantity = BigInt(asset.quantity);
    if (quantity <= 0n) {
      continue;
    }

    const { policyId, assetName } = splitAssetUnit(asset.unit);
    const current = spentByKey.get(assetKey(policyId, assetName)) ?? 0n;
    spentByKey.set(assetKey(policyId, assetName), current + quantity);
  }

  return spentByKey;
}

function allowanceCanCoverSpent(
  effectiveRemainingAllowance: ParsedAllowanceAsset[],
  spentAllowance: Asset[]
) {
  const remainingByKey = new Map(
    effectiveRemainingAllowance.map((asset) => [
      assetKey(asset.policyId, asset.assetName),
      asset.amount
    ])
  );

  for (const [key, spent] of toSpentAllowanceMap(spentAllowance).entries()) {
    const available = remainingByKey.get(key) ?? 0n;
    if (spent > available) {
      return false;
    }
  }

  return true;
}

function findMatchedUsers(
  stateDatum: ConstrData,
  allowanceSignerKeyHash: string,
  txEarliestTimeMs: number,
  txLatestTimeMs: number
): MatchedUserCandidate[] {
  const normalizedSigner = allowanceSignerKeyHash.trim();
  if (!normalizedSigner) {
    throw new Error("Connected payment key hash is required for Allowance Withdrawal.");
  }

  const parsedState = parseState(stateDatum);
  return parsedState.users
    .map((user, index) => {
      const normalizedAllowance = normalizeAllowance(
        user.remainingAllowance,
        txEarliestTimeMs,
        txLatestTimeMs,
        user.nextAllowanceReset,
        user.perDayAllowance
      );

      return {
        parsedState,
        matchedUser: user,
        matchedUserIndex: index,
        effectiveRemainingAllowance: normalizedAllowance.effectiveRemainingAllowance,
        nextAllowanceReset: normalizedAllowance.nextAllowanceReset
      };
    })
    .filter(({ matchedUser }) => matchedUser.userWallets.includes(normalizedSigner));
}

function selectMatchedUser(
  matches: MatchedUserCandidate[],
  spentAllowance: Asset[]
) {
  const viableMatches = matches.filter((match) =>
    allowanceCanCoverSpent(match.effectiveRemainingAllowance, spentAllowance)
  );

  if (viableMatches.length === 0) {
    throw new Error(
      "The connected payment key hash does not match any allowance user with enough remaining allowance for the requested transfer."
    );
  }

  if (viableMatches.length > 1) {
    throw new Error(
      "The connected payment key hash can satisfy multiple user records for this allowance spend. Narrow the transfer amount or use a non-shared signer."
    );
  }

  return viableMatches[0]!;
}

export function deriveAllowanceWithdrawalStateDatum(input: {
  allowanceSignerKeyHash: string;
  extraTransfers: PayoutTransfer[];
  stateDatum: ConstrData;
  txEarliestTimeMs: number;
  txLatestTimeMs: number;
  walletInputAmounts: Asset[][];
  walletOutputs: WalletScriptOutput[];
}): AllowanceWithdrawalComputation {
  ensureRequestedAssetsFitWithinInputs(
    input.walletInputAmounts,
    input.walletOutputs,
    input.extraTransfers
  );

  const spentAllowance = sumAssetListsByUnit(
    input.extraTransfers.map((transfer) => transfer.amount)
  );

  if (spentAllowance.length === 0) {
    throw new Error("Allowance Withdrawal requires at least one positive forwarded transfer.");
  }

  const matches = findMatchedUsers(
    input.stateDatum,
    input.allowanceSignerKeyHash,
    input.txEarliestTimeMs,
    input.txLatestTimeMs
  );
  const {
    parsedState,
    matchedUser,
    matchedUserIndex,
    effectiveRemainingAllowance,
    nextAllowanceReset
  } = selectMatchedUser(matches, spentAllowance);

  const spentByKey = toSpentAllowanceMap(spentAllowance);

  const resultingRemainingAllowance = effectiveRemainingAllowance.map((asset) => {
    const key = assetKey(asset.policyId, asset.assetName);
    const spent = spentByKey.get(key) ?? 0n;

    if (spent > asset.amount) {
      throw new Error(
        `Allowance Withdrawal exceeds the available remaining allowance for ${partsToUnit(asset.policyId, asset.assetName)}.`
      );
    }

    spentByKey.delete(key);
    return {
      ...asset,
      amount: asset.amount - spent
    };
  });

  if (spentByKey.size > 0) {
    const [unexpectedKey] = spentByKey.keys();
    throw new Error(
      `Allowance Withdrawal cannot spend assets outside the matched user's allowance (${unexpectedKey}).`
    );
  }

  const nextUsers = [...(parsedState.accessRaw.fields[0] as Data[])];
  const nextUserFields = [...matchedUser.raw.fields];
  nextUserFields[3] = serializeValueEntries(
    resultingRemainingAllowance,
    `state.users[${matchedUserIndex}].remaining_allowance`
  );
  nextUserFields[4] = nextAllowanceReset;
  nextUsers[matchedUserIndex] = {
    ...matchedUser.raw,
    fields: nextUserFields
  };

  const nextAccessFields = [...parsedState.accessRaw.fields];
  nextAccessFields[0] = nextUsers;
  const nextProofOfLifeFields = [...parsedState.proofOfLifeRaw.fields];
  const nextStateFields = [...parsedState.raw.fields];
  const nextProofOfLifeUnlockTime = nextProofOfLifeUnlockTimeForUser(
    parsedState,
    matchedUser,
    input.txLatestTimeMs
  );
  nextProofOfLifeFields[0] =
    nextProofOfLifeUnlockTime === null
      ? {
          alternative: 1,
          fields: []
        }
      : {
          alternative: 0,
          fields: [nextProofOfLifeUnlockTime]
        };
  nextStateFields[0] = {
    ...parsedState.accessRaw,
    fields: nextAccessFields
  };
  nextStateFields[1] = {
    ...parsedState.proofOfLifeRaw,
    fields: nextProofOfLifeFields
  };
  const walletWitness = buildWalletWitnessData({
    kind: "allowance-withdrawal",
    userId: matchedUser.id,
    spentAllowance
  });

  return {
    matchedUserId: matchedUser.id,
    matchedUserIndex,
    matchedUserWallets: [...matchedUser.userWallets],
    currentRemainingAllowance: formatAllowanceAssets(matchedUser.remainingAllowance),
    effectiveRemainingAllowance: formatAllowanceAssets(effectiveRemainingAllowance),
    nextAllowanceReset,
    walletWitness,
    spentAllowance,
    resultingRemainingAllowance: formatAllowanceAssets(resultingRemainingAllowance),
    outputDatum: {
      ...parsedState.raw,
      fields: nextStateFields
    }
  };
}

function nextProofOfLifeUnlockTimeForUser(
  parsedState: ParsedState,
  matchedUser: ParsedUser,
  txLatestTimeMs: number
) {
  if (!matchedUser.canRenewProofOfLife || matchedUser.isAdmin) {
    return parsedState.proofOfLifeUnlockTime;
  }

  if (parsedState.proofOfLifeIncrement === null) {
    return parsedState.proofOfLifeUnlockTime;
  }

  const renewedUnlockTime = txLatestTimeMs + parsedState.proofOfLifeIncrement;
  if (parsedState.proofOfLifeUnlockTime !== null && parsedState.proofOfLifeUnlockTime > renewedUnlockTime) {
    return parsedState.proofOfLifeUnlockTime;
  }

  return renewedUnlockTime;
}
