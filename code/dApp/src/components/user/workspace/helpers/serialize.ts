import { type OptionalConstrPresetForm, type RequiredConstrPresetForm, type TransferFormState, type WalletScriptOutputFormState } from "@/components/user/workspace/types";
import { type ConstrData, type PayoutTransfer, type WalletScriptOutput } from "@/lib/types/contracts";

function parseNonNegativeIntegerString(value: string, label: string) {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${label} must be a non-negative integer.`);
  }

  return Number(normalized);
}

// The editors seed rows at "0"; a row left there reaches the transaction output
// verbatim and the ledger rejects zero-quantity assets after signing. A row
// with no positive amount is not value, so it never serializes.
function hasPositiveQuantity(quantity: string) {
  const trimmed = quantity.trim();
  return trimmed.length > 0 && !/^0+$/.test(trimmed);
}

function serializeOptionalConstrPreset(
  preset: OptionalConstrPresetForm,
  label: string
): ConstrData | undefined {
  if (preset.mode === "none") {
    return undefined;
  }

  if (preset.mode === "empty-alt-0") {
    return { alternative: 0, fields: [] };
  }

  if (preset.mode === "empty-alt-1") {
    return { alternative: 1, fields: [] };
  }

  return {
    alternative: parseNonNegativeIntegerString(preset.customAlternative, `${label} alternative`),
    fields: []
  };
}

export function serializeRequiredConstrPreset(
  preset: RequiredConstrPresetForm,
  label: string
): ConstrData {
  if (preset.mode === "empty-alt-0") {
    return { alternative: 0, fields: [] };
  }

  if (preset.mode === "empty-alt-1") {
    return { alternative: 1, fields: [] };
  }

  return {
    alternative: parseNonNegativeIntegerString(preset.customAlternative, `${label} alternative`),
    fields: []
  };
}

export function serializeWalletOutputs(
  outputs: WalletScriptOutputFormState[]
): WalletScriptOutput[] {
  return outputs.map((output, index) => {
    const amount = output.amount.filter(
      (asset) => asset.unit.trim().length > 0 && hasPositiveQuantity(asset.quantity)
    );
    // An output whose every row was zero is not an output: an empty value list
    // fails min-UTxO downstream with a message that names nothing the user did.
    // Refuse it here instead, where the validation probes turn the throw into a
    // field error naming the row.
    if (amount.length === 0) {
      throw new Error(`Locked output ${index + 1} needs an amount greater than zero.`);
    }
    return {
      amount,
      inlineDatum: serializeOptionalConstrPreset(
        output.inlineDatum,
        `Locked output ${index + 1} inline datum`
      )
    };
  });
}

export function serializeTransfers(transfers: TransferFormState[]): PayoutTransfer[] {
  return transfers.map((transfer, index) => {
    const amount = transfer.amount.filter(
      (asset) => asset.unit.trim().length > 0 && hasPositiveQuantity(asset.quantity)
    );
    if (amount.length === 0) {
      throw new Error(`Transfer ${index + 1} needs an amount greater than zero.`);
    }
    return {
      address: transfer.address.trim(),
      amount,
      inlineDatum: serializeOptionalConstrPreset(
        transfer.inlineDatum,
        `Transfer ${index + 1} inline datum`
      )
    };
  });
}

