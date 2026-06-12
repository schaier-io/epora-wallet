import { type OptionalConstrPresetForm, type RequiredConstrPresetForm, type TransferFormState, type WalletScriptOutputFormState } from "@/components/user/workspace/types";
import { type ConstrData, type PayoutTransfer, type WalletScriptOutput } from "@/lib/types/contracts";

function parseNonNegativeIntegerString(value: string, label: string) {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${label} must be a non-negative integer.`);
  }

  return Number(normalized);
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
  return outputs.map((output, index) => ({
    amount: output.amount.filter(
      (asset) => asset.unit.trim().length > 0 && asset.quantity.trim().length > 0
    ),
    inlineDatum: serializeOptionalConstrPreset(
      output.inlineDatum,
      `Locked output ${index + 1} inline datum`
    )
  }));
}

export function serializeTransfers(transfers: TransferFormState[]): PayoutTransfer[] {
  return transfers.map((transfer, index) => ({
    address: transfer.address.trim(),
    amount: transfer.amount.filter(
      (asset) => asset.unit.trim().length > 0 && asset.quantity.trim().length > 0
    ),
    inlineDatum: serializeOptionalConstrPreset(
      transfer.inlineDatum,
      `Transfer ${index + 1} inline datum`
    )
  }));
}

