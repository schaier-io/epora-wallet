import type { UTxO } from "@meshsdk/common";

const optionalOutputFields = ["dataHash", "plutusData", "scriptRef", "scriptHash"] as const;

export function immutableOutputs(value: unknown, hash: string, index?: number): UTxO[] | undefined {
  if (!Array.isArray(value) || !value.length) return undefined;
  const outputs: UTxO[] = [];
  const seen = new Set<number>();
  for (const item of value as UTxO[]) {
    const input = item?.input;
    const output = item?.output;
    if (!input || typeof input.txHash !== "string" || input.txHash.toLowerCase() !== hash || !Number.isSafeInteger(input.outputIndex)
      || input.outputIndex < 0 || (index !== undefined && input.outputIndex !== index)
      || seen.has(input.outputIndex) || !output || typeof output.address !== "string"
      || !output.address || !Array.isArray(output.amount) || !output.amount.length
      || output.amount.some(asset => typeof asset?.unit !== "string" || !asset.unit
        || typeof asset.quantity !== "string" || !/^\d+$/.test(asset.quantity))
      || optionalOutputFields.some(field => output[field] !== undefined && typeof output[field] !== "string")) {
      return undefined;
    }
    seen.add(input.outputIndex);
    const clean: UTxO = {
      input: { txHash: input.txHash, outputIndex: input.outputIndex },
      output: { address: output.address, amount: output.amount.map(({ unit, quantity }) => ({ unit, quantity })) }
    };
    for (const field of optionalOutputFields) {
      if (output[field] !== undefined) clean.output[field] = output[field];
    }
    outputs.push(clean);
  }
  return outputs;
}
