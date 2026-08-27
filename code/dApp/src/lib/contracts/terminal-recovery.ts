import { readStateSections } from "@/lib/contracts/state-layout";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibContractsTerminalRecovery.json";
import { validateStateDatum } from "@/lib/contracts/state-validation";
import type {
  Asset,
  ConstrData,
  PayoutTransfer,
  WalletInputRef,
  WalletScriptOutput
} from "@/lib/types/contracts";
import type { UTxO } from "@meshsdk/core";

const i18n = createDefaultTranslator("LibContractsTerminalRecovery", defaultMessages);

export const TERMINAL_RECOVERY_REACHABILITY_ERROR =
  i18n("reachabilityError");

export const TERMINAL_RECOVERY_WARNING =
  i18n("terminalRecoveryWarning");

export function isTerminalBeneficiaryOutputState(stateDatum: ConstrData) {
  const sections = readStateSections(stateDatum, i18n("outputStateLabel"));
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
    i18n("inputStateLabel")
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
      i18n("selectCompleteFundSet", {
        missing: missing.join(", ") || i18n("none"),
        unexpected: unexpected.join(", ") || i18n("none")
      })
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
      i18n("transferCompleteValue")
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
    i18n("inputStateLabel")
  );
  if (inputSections.streamingPayments.length > 0) {
    throw new Error(
      i18n("scheduledPaymentsRemain")
    );
  }
  if (input.walletOutputs.length > 0) {
    throw new Error(
      i18n("continuingOutputNotAllowed")
    );
  }

  assertSameRefs(input.selectedWalletInputs, input.credentialWideWalletRefs);
  assertFullValueSweep(input.selectedWalletInputs, input.transfers);
}
