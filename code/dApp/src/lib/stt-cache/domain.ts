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
export const STT_RECENT_HEAD_STALE_MS = 60_000;
export const STT_WALLET_RECONCILE_STALE_MS = 300_000;

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
