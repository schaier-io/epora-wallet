import type { SttSpendFormInput } from "@/lib/types/contracts";
import { isOnChainInteger } from "@/lib/contracts/on-chain-integer";
import { assertValidAssetList, assertValidConstrData, assertValidPayoutTransfers, assertValidWalletInputRefs, assertValidWalletOutputs } from "./guards";

export function readCallerForwardedState(input: SttSpendFormInput) {
  assertValidConstrData(input.outputDatum, "STT output datum");
  assertValidAssetList(input.outputAssets, "STT output assets");
  return { datum: input.outputDatum, assets: input.outputAssets };
}

export function validateSttSpendInput(action: string, input: SttSpendFormInput): void {
  const walletInputs = input.walletInputs ?? [];
  const walletOutputs = input.walletOutputs ?? [];
  const extraTransfers = input.extraTransfers ?? [];
  if (action === "remove-access-index" && !input.removeAccessTarget) {
    throw new Error("Removing an access entry requires a target (list and index).");
  }

  assertValidWalletInputRefs(walletInputs, "Locked contract inputs");
  assertValidWalletOutputs(walletOutputs, "Locked contract outputs");
  assertValidPayoutTransfers(extraTransfers, "Transfers / Forwarded Outputs");
  if (action === "use-allowance") {
    if (!input.allowanceSignerKeyHash?.trim()) {
      throw new Error(
        "Allowance Withdrawal requires the connected wallet payment key hash."
      );
    }

    if (walletInputs.length === 0) {
      throw new Error("Allowance Withdrawal requires at least one locked contract input.");
    }

    if (extraTransfers.length === 0) {
      throw new Error("Allowance Withdrawal requires at least one forwarded transfer.");
    }
  }

  if (action === "stop-beneficiary-stream") {
    if (!input.beneficiarySignerKeyHash?.trim()) {
      throw new Error("Stopping a beneficiary stream requires the connected wallet payment key hash.");
    }
    if (!isOnChainInteger(input.beneficiaryStreamStopId)) {
      throw new Error("Stopping a beneficiary stream requires the target streaming-payment id.");
    }
    if (walletInputs.length || walletOutputs.length || extraTransfers.length) {
      throw new Error("Stopping a beneficiary stream cannot spend wallet inputs or create wallet outputs or transfers.");
    }
  }
}
