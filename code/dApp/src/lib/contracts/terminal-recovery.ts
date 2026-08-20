import { readStateSections } from "@/lib/contracts/state-layout";
import { validateStateDatum } from "@/lib/contracts/state-validation";
import type {
  Asset,
  ConstrData,
  PayoutTransfer,
  WalletInputRef,
  WalletScriptOutput
} from "@/lib/types/contracts";
import type { UTxO } from "@meshsdk/core";

export const TERMINAL_RECOVERY_REACHABILITY_ERROR =
  "Add at least one owner, or add a recovery path that can still use the wallet.";

/**
 * Shown in the review rail immediately before the signature that ends a wallet.
 *
 * It used to be written in mechanism: `terminal recovery`, `access path`, `sweeps`,
 * `locked asset`, `chain-indexer snapshot`, `STT`, `UTxOs` — seven terms in four sentences,
 * none of which a user has. It named the one thing that matters (`Irreversible`) in the
 * first word and then never said what becomes irreversible. This states the outcome
 * instead, and keeps the one caveat that has to survive: the app can only move what it can
 * currently see.
 */
export const TERMINAL_RECOVERY_WARNING =
  "This is permanent. After you sign, nobody can spend from this wallet again: not you, not another owner, not a recovery contact. This transaction moves out every fund the app can currently see. Anything it cannot see, and anything sent to this wallet later, stays there for good. Check the funds listed below before you sign.";

export function isTerminalBeneficiaryOutputState(stateDatum: ConstrData) {
  const sections = readStateSections(stateDatum, "Terminal recovery output state");
  return (
    sections.beneficiaries.length === 0 &&
    validateStateDatum(stateDatum).includes(TERMINAL_RECOVERY_REACHABILITY_ERROR)
  );
}

export function isTerminalBeneficiaryWithdrawal(
  inputStateDatum: ConstrData,
  outputStateDatum: ConstrData
) {
  const inputSections = readStateSections(
    inputStateDatum,
    "Terminal recovery input state"
  );
  return (
    inputSections.beneficiaries.length === 1 &&
    isTerminalBeneficiaryOutputState(outputStateDatum)
  );
}

function refKey(ref: WalletInputRef) {
  return `${ref.txHash.toLowerCase()}#${ref.outputIndex}`;
}

function assertSameRefs(selectedInputs: UTxO[], credentialRefs: WalletInputRef[]) {
  const selected = new Set(
    selectedInputs.map((utxo) =>
      refKey({
        txHash: utxo.input.txHash,
        outputIndex: utxo.input.outputIndex
      })
    )
  );
  const credentialWide = new Set(credentialRefs.map(refKey));
  const missing = [...credentialWide].filter((ref) => !selected.has(ref));
  const unexpected = [...selected].filter((ref) => !credentialWide.has(ref));

  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `Terminal recovery must consume every UTxO under the wallet payment credential. Missing: ${missing.join(", ") || "none"}. Unexpected: ${unexpected.join(", ") || "none"}. Refresh wallet funds and select the complete set.`
    );
  }
}

function sumAssets(amounts: Asset[][]) {
  const totals = new Map<string, bigint>();
  for (const amount of amounts) {
    for (const asset of amount) {
      totals.set(
        asset.unit,
        (totals.get(asset.unit) ?? 0n) + BigInt(asset.quantity)
      );
    }
  }
  return [...totals.entries()]
    .filter(([, quantity]) => quantity !== 0n)
    .sort(([left], [right]) => left.localeCompare(right));
}

function assertFullValueSweep(
  walletInputs: UTxO[],
  transfers: PayoutTransfer[]
) {
  const inputValue = sumAssets(
    walletInputs.map((walletInput) => walletInput.output.amount)
  );
  const transferredValue = sumAssets(transfers.map((transfer) => transfer.amount));
  if (
    inputValue.length !== transferredValue.length ||
    inputValue.some(
      ([unit, quantity], index) => {
        const transferred = transferredValue[index];
        return !transferred || transferred[0] !== unit || transferred[1] !== quantity;
      }
    )
  ) {
    throw new Error(
      "Terminal recovery must transfer the complete value of every selected wallet input. No asset may remain at the wallet credential."
    );
  }
}

export function assertTerminalRecoveryIsComplete(input: {
  inputStateDatum: ConstrData;
  selectedWalletInputs: UTxO[];
  credentialWideWalletRefs: WalletInputRef[];
  walletOutputs: WalletScriptOutput[];
  transfers: PayoutTransfer[];
}) {
  const inputSections = readStateSections(
    input.inputStateDatum,
    "Terminal recovery input state"
  );
  if (inputSections.streamingPayments.length > 0) {
    throw new Error(
      "Terminal recovery cannot run while streaming payments remain. Settle every due payment, then remove or finish every schedule before removing the last recovery contact."
    );
  }
  if (input.walletOutputs.length > 0) {
    throw new Error(
      "Terminal recovery cannot create a continuing wallet output. Transfer every locked asset out of the wallet."
    );
  }

  assertSameRefs(input.selectedWalletInputs, input.credentialWideWalletRefs);
  assertFullValueSweep(input.selectedWalletInputs, input.transfers);
}
