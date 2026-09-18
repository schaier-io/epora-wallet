import type { Asset, TransactionInfo, UTxO } from "@meshsdk/common";
import { getSttMintPolicyId, getSttSpendScript, resolveScriptAddress, resolveWalletSpendAddress } from "@/lib/contracts/blueprint";

export const STT_CACHE_NETWORK = "preprod";
export const STT_SYNC_CURSOR_KEYS = {
  recentHead: "recent-head",
  historyBackfill: "history-backfill",
  walletReconcile: "wallet-reconcile"
} as const;
export const STT_LOOKUP_DEFAULT_TX_LIMIT = 10;
export const STT_LOOKUP_MAX_TX_LIMIT = 50;
export const STT_LOOKUP_WALLET_PAGE_SIZE = 25;

export type SttWalletStatusValue = "ACTIVE" | "CLOSED";
export type SttWalletTransitionKindValue = "MINT" | "FORWARD" | "CLOSE" | "UNKNOWN";
export type SttParticipantRoleValue =
  | "ADMIN_USER"
  | "USER"
  | "BENEFICIARY"
  | "STREAMING_PAYMENT_RECIPIENT";

export type SttWalletIdentity = {
  network: typeof STT_CACHE_NETWORK;
  policyId: string;
  assetNameHex: string;
  unit: string;
  sttScriptAddress: string;
  walletScriptAddress: string;
};

type SttTouchpoint = {
  hasInput: boolean;
  hasOutput: boolean;
};

function isPositiveAssetAmount(asset: Asset) {
  try {
    return BigInt(asset.quantity) > 0n;
  } catch {
    return false;
  }
}

function isSttUnit(unit: string, policyId: string) {
  return unit.startsWith(policyId) && unit.length > policyId.length;
}

function extractUnitsFromAmount(amount: Asset[], policyId: string) {
  return amount
    .filter((asset) => isSttUnit(asset.unit, policyId) && isPositiveAssetAmount(asset))
    .map((asset) => asset.unit);
}

function extractUnitsFromUtxo(utxo: UTxO, policyId: string, expectedAddress: string) {
  if (utxo.output.address !== expectedAddress) {
    return [];
  }

  return extractUnitsFromAmount(utxo.output.amount, policyId);
}

export function getSttPolicyId() {
  return getSttMintPolicyId();
}

export function getSttScriptAddress() {
  return resolveScriptAddress(getSttSpendScript());
}

export function buildWalletIdentity(unit: string, policyId = getSttPolicyId()): SttWalletIdentity {
  if (!isSttUnit(unit, policyId)) {
    throw new Error(`Unit "${unit}" is not a valid STT asset under policy ${policyId}.`);
  }

  const assetNameHex = unit.slice(policyId.length);

  return {
    network: STT_CACHE_NETWORK,
    policyId,
    assetNameHex,
    unit,
    sttScriptAddress: getSttScriptAddress(),
    walletScriptAddress: resolveWalletSpendAddress({
      sttPolicyId: policyId,
      sttAssetNameHex: assetNameHex
    })
  };
}

export function deriveWalletStatusFromTransition(
  transitionKind: SttWalletTransitionKindValue
): SttWalletStatusValue {
  return transitionKind === "CLOSE" ? "CLOSED" : "ACTIVE";
}

export function classifySttWalletTransition(touchpoint: SttTouchpoint): SttWalletTransitionKindValue {
  if (touchpoint.hasInput && touchpoint.hasOutput) {
    return "FORWARD";
  }

  if (!touchpoint.hasInput && touchpoint.hasOutput) {
    return "MINT";
  }

  if (touchpoint.hasInput && !touchpoint.hasOutput) {
    return "CLOSE";
  }

  return "UNKNOWN";
}

export function extractTouchedWalletUnits(
  transaction: Pick<TransactionInfo, "inputs" | "outputs">,
  policyId = getSttPolicyId(),
  sttScriptAddress = getSttScriptAddress()
) {
  const touchpoints = new Map<string, SttTouchpoint>();

  for (const input of transaction.inputs) {
    for (const unit of extractUnitsFromUtxo(input, policyId, sttScriptAddress)) {
      const current = touchpoints.get(unit) ?? { hasInput: false, hasOutput: false };
      touchpoints.set(unit, {
        ...current,
        hasInput: true
      });
    }
  }

  for (const output of transaction.outputs) {
    for (const unit of extractUnitsFromUtxo(output, policyId, sttScriptAddress)) {
      const current = touchpoints.get(unit) ?? { hasInput: false, hasOutput: false };
      touchpoints.set(unit, {
        ...current,
        hasOutput: true
      });
    }
  }

  return touchpoints;
}

export function compareBlockPosition(
  left: { blockHeight: number | null; blockTime: number | null; txIndex: number },
  right: { blockHeight: number | null; blockTime: number | null; txIndex: number }
) {
  if ((left.blockHeight ?? -1) !== (right.blockHeight ?? -1)) {
    return (left.blockHeight ?? -1) - (right.blockHeight ?? -1);
  }

  if ((left.blockTime ?? -1) !== (right.blockTime ?? -1)) {
    return (left.blockTime ?? -1) - (right.blockTime ?? -1);
  }

  return left.txIndex - right.txIndex;
}

export function compareLatestSeen(
  current: { blockHeight: number | null; blockTime: number | null },
  incoming: { blockHeight: number | null; blockTime: number | null }
) {
  return compareBlockPosition(
    {
      blockHeight: current.blockHeight,
      blockTime: current.blockTime,
      txIndex: 0
    },
    {
      blockHeight: incoming.blockHeight,
      blockTime: incoming.blockTime,
      txIndex: 0
    }
  );
}

/** Absolute ledger slot as the provider reports it: a non-negative integer string. */
export function parseChainSlot(slot: string | null | undefined): number | null {
  if (slot === null || slot === undefined || !/^\d+$/.test(slot)) {
    return null;
  }
  const parsed = Number(slot);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export type WalletSnapshotPosition = {
  blockHeight: number | null;
  blockTime: number | null;
  slot: number | null;
  txIndex: number | null;
};

/**
 * Whether an incoming wallet snapshot sits behind the stored one and must not
 * overwrite it.
 *
 * The slot is the ledger-assigned absolute position of the block that contains
 * the transaction that produced a snapshot, so it orders snapshots except for
 * two transitions recorded in the same block; the transaction index breaks
 * those ties. Mesh's Blockfrost `fetchTxInfo` always reports `slot` and
 * `index` but neither `blockHeight` nor `blockTime`, which left the
 * block-position comparison nothing to weigh on the reconcile path. Snapshot
 * pairs the slot and index cannot order fall through to the block-position
 * comparison, which a provider that reports those fields can still answer.
 */
export function snapshotIsBehindStored(
  stored: WalletSnapshotPosition,
  incoming: WalletSnapshotPosition
): boolean {
  if (stored.slot !== null && incoming.slot !== null) {
    if (stored.slot !== incoming.slot) {
      return stored.slot > incoming.slot;
    }
    if (
      stored.txIndex !== null &&
      incoming.txIndex !== null &&
      stored.txIndex !== incoming.txIndex
    ) {
      return stored.txIndex > incoming.txIndex;
    }
  }

  const incomingIsPositioned =
    incoming.blockHeight !== null || incoming.blockTime !== null;
  return incomingIsPositioned && compareLatestSeen(stored, incoming) > 0;
}
