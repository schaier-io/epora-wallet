import { type RuntimeTxBuilder } from "./budget";
import { UTXO_SIZE_OVERHEAD_BYTES } from "./constants";
import { type ReferenceScriptResolution } from "./reference-scripts";
import { type Asset, type ConstrData, DEFAULT_MINT_STT_LOVELACE } from "@/lib/types/contracts";
import { type Budget, type BuilderData, DEFAULT_PROTOCOL_PARAMETERS, type LanguageVersion, type Output as MeshOutput, type Protocol, type Recipient } from "@meshsdk/common";
import { type Transaction, type UTxO } from "@meshsdk/core";
import { Datum, PlutusV1Script, PlutusV2Script, PlutusV3Script, Script, TransactionOutput, fromBuilderToPlutusData, toCardanoAddress, toValue } from "@meshsdk/core-cst";
import { blake2b } from "ethereum-cryptography/blake2b";
import { bytesToHex, hexToBytes } from "ethereum-cryptography/utils";

export function redeemValueWithRequiredReferenceScript(
  tx: Transaction,
  value: UTxO,
  referenceScript: ReferenceScriptResolution,
  redeemer: { data: ConstrData; budget?: Budget }
) {
  tx.redeemValue({
    value,
    script: referenceScript.utxo,
    redeemer
  });
}



export function redeemValueWithInlineScript(
  tx: Transaction,
  value: UTxO,
  script: { code: string; version: LanguageVersion },
  redeemer: { data: ConstrData; budget?: Budget }
) {
  tx.redeemValue({
    value,
    script,
    redeemer
  });
}



export function sendAssetsWithOptionalInlineDatumAndReferenceScript(
  tx: Transaction,
  address: string,
  amount: Asset[],
  datum?: ConstrData,
  referenceScript?: { code: string; version: LanguageVersion },
  options?: {
    skipMinimumLovelaceAdjustment?: boolean;
  }
) {
  const output = buildMeshOutput(address, amount, datum, referenceScript);
  const txBuilder = tx.txBuilder as RuntimeTxBuilder;
  if (!options?.skipMinimumLovelaceAdjustment) {
    ensureOutputHasMinimumLovelace(output, txBuilder._protocolParams);
  }

  if (!datum && !referenceScript) {
    tx.sendAssets({ address }, output.amount);
    return output;
  }

  txBuilder.txOut(address, output.amount);

  if (datum) {
    txBuilder.txOutInlineDatumValue(datum, "Mesh");
  }

  if (referenceScript) {
    txBuilder.txOutReferenceScript(referenceScript.code, referenceScript.version);
  }

  return output;
}



export function sendReferenceScriptOnlyOutput(
  tx: Transaction,
  address: string,
  referenceScript: { code: string; version: LanguageVersion },
  amount: Asset[] = [],
  options?: {
    skipMinimumLovelaceAdjustment?: boolean;
  }
) {
  return sendAssetsWithOptionalInlineDatumAndReferenceScript(
    tx,
    address,
    amount,
    undefined,
    referenceScript,
    options
  );
}



function buildMeshOutput(
  address: string,
  amount: Asset[],
  datum?: ConstrData,
  referenceScript?: { code: string; version: LanguageVersion }
): MeshOutput {
  return {
    address,
    amount: amount.map((asset) => ({ ...asset })),
    datum: datum
      ? {
          type: "Inline",
          data: {
            type: "Mesh",
            content: datum
          } satisfies BuilderData
        }
      : undefined,
    referenceScript
  };
}



function ensureOutputHasMinimumLovelace(
  output: MeshOutput,
  protocolParams?: Protocol
) {
  const minimumLovelace = calculateMinimumLovelaceForOutput(
    output,
    protocolParams
  );
  const currentLovelace = getLovelaceQuantity(output.amount);

  if (currentLovelace < minimumLovelace) {
    setLovelaceQuantity(output.amount, minimumLovelace);
  }

  return minimumLovelace;
}



function calculateMinimumLovelaceForOutput(
  output: MeshOutput,
  protocolParams = DEFAULT_PROTOCOL_PARAMETERS
) {
  const outputForSizing = {
    ...output,
    amount: output.amount.map((asset) => ({ ...asset }))
  };

  // A throwaway lovelace value purely to give the output a stable CBOR length
  // for sizing; the real minimum is derived from that size below.
  setLovelaceQuantity(outputForSizing.amount, 10_000_000n);

  const encodedOutput = toSizedCardanoOutput(outputForSizing);
  const outputCbor = String(encodedOutput.toCbor());
  // ledger overhead + CBOR byte length (hex/2) + 1 rounding byte.
  const outputSize = BigInt(UTXO_SIZE_OVERHEAD_BYTES + outputCbor.length / 2 + 1);

  return outputSize * BigInt(protocolParams.coinsPerUtxoSize);
}



function toSizedCardanoOutput(output: MeshOutput) {
  const cardanoOutput = new TransactionOutput(
    toCardanoAddress(output.address),
    toValue(output.amount)
  );

  if (output.datum?.type === "Hash" || output.datum?.type === "Embedded") {
    cardanoOutput.setDatum(
      Datum.newDataHash(fromBuilderToPlutusData(output.datum.data).hash())
    );
  } else if (output.datum?.type === "Inline") {
    cardanoOutput.setDatum(
      Datum.newInlineData(fromBuilderToPlutusData(output.datum.data))
    );
  }

  if (output.referenceScript) {
    switch (output.referenceScript.version) {
      case "V1":
        cardanoOutput.setScriptRef(
          Script.newPlutusV1Script(
            PlutusV1Script.fromCbor(
              output.referenceScript.code as Parameters<typeof PlutusV1Script.fromCbor>[0]
            )
          )
        );
        break;
      case "V2":
        cardanoOutput.setScriptRef(
          Script.newPlutusV2Script(
            PlutusV2Script.fromCbor(
              output.referenceScript.code as Parameters<typeof PlutusV2Script.fromCbor>[0]
            )
          )
        );
        break;
      case "V3":
        cardanoOutput.setScriptRef(
          Script.newPlutusV3Script(
            PlutusV3Script.fromCbor(
              output.referenceScript.code as Parameters<typeof PlutusV3Script.fromCbor>[0]
            )
          )
        );
        break;
    }
  }

  return cardanoOutput;
}



export function setLovelaceQuantity(amount: Asset[], quantity: bigint) {
  const lovelaceIndex = amount.findIndex(
    (asset) => asset.unit === "lovelace" || asset.unit === ""
  );
  const nextQuantity = quantity.toString();

  if (lovelaceIndex >= 0) {
    amount[lovelaceIndex] = {
      ...amount[lovelaceIndex],
      unit: "lovelace",
      quantity: nextQuantity
    };
    return;
  }

  amount.push({
    unit: "lovelace",
    quantity: nextQuantity
  });
}



export function getLovelaceQuantity(amount: Asset[]) {
  const lovelaceAsset = amount.find(
    (asset) => asset.unit === "lovelace" || asset.unit === ""
  );

  return BigInt(lovelaceAsset?.quantity ?? "0");
}



export function mergeAssetLists(amounts: Asset[][]): Asset[] {
  const totals = new Map<string, bigint>();

  for (const amountList of amounts) {
    for (const asset of amountList) {
      const current = totals.get(asset.unit) ?? 0n;
      totals.set(asset.unit, current + BigInt(asset.quantity));
    }
  }

  return [...totals.entries()]
    .filter(([, quantity]) => quantity !== 0n)
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



export function subtractSelectedInputRemainder(total: Asset[], requested: Asset[]): Asset[] {
  const requestedTotals = new Map<string, bigint>();

  for (const asset of requested) {
    const current = requestedTotals.get(asset.unit) ?? 0n;
    requestedTotals.set(asset.unit, current + BigInt(asset.quantity));
  }

  return total
    .map((asset) => {
      const remaining =
        BigInt(asset.quantity) - (requestedTotals.get(asset.unit) ?? 0n);

      if (remaining <= 0n) {
        return null;
      }

      return {
        unit: asset.unit,
        quantity: remaining.toString()
      };
    })
    .filter((asset): asset is Asset => asset !== null);
}



export function mergeAssetsByUnit(preferred: Asset[], fallback: Asset[]): Asset[] {
  const merged = new Map<string, string>();

  for (const asset of fallback) {
    merged.set(asset.unit, asset.quantity);
  }

  for (const asset of preferred) {
    merged.set(asset.unit, asset.quantity);
  }

  return [...merged.entries()]
    .filter(([, quantity]) => BigInt(quantity) !== 0n)
    .sort(([leftUnit], [rightUnit]) => {
      if (leftUnit === "lovelace") return -1;
      if (rightUnit === "lovelace") return 1;
      return leftUnit.localeCompare(rightUnit);
    })
    .map(([unit, quantity]) => ({ unit, quantity }));
}



export function mergeRestrictedSttAssets(
  preferred: Asset[],
  fallback: Asset[],
  action:
    | "use"
    | "renew-proof-of-life"
    | "update-state"
    | "manage-streaming-payments"
    | "use-beneficiary"
    | "payout-streaming-payment"
    | "consolidate-utxo"
): Asset[] {
  const fallbackByUnit = new Map(
    fallback.map((asset) => [asset.unit, BigInt(asset.quantity)])
  );
  const preferredByUnit = new Map(
    preferred.map((asset) => [asset.unit, BigInt(asset.quantity)])
  );

  for (const asset of preferred) {
    if (asset.unit === "lovelace") {
      continue;
    }

    const expectedQuantity = fallbackByUnit.get(asset.unit);
    if (expectedQuantity === undefined || expectedQuantity !== BigInt(asset.quantity)) {
      throw new Error(
        `${action} can only override lovelace on the forwarded STT output. Non-lovelace assets must stay exactly the same as the consumed STT input.`
      );
    }
  }

  const inputLovelace = fallbackByUnit.get("lovelace") ?? 0n;
  const outputLovelace = preferredByUnit.get("lovelace") ?? inputLovelace;
  if (outputLovelace < inputLovelace) {
    throw new Error(
      `${action} cannot reduce lovelace on the forwarded STT output. Only admin Use may remove value from the STT UTxO.`
    );
  }

  if (outputLovelace === inputLovelace) {
    return fallback;
  }

  return mergeAssetsByUnit(
    [{ unit: "lovelace", quantity: outputLovelace.toString() }],
    fallback
  );
}

// The STT datum is the State constructor directly — no wallet-witness
// wrapper anymore. The witness merged into the SttAction redeemer. This
// helper is retained as a pass-through (with State-shape validation) so the
// many call sites that previously had to "wrap with witness" can stay
// readable; pass the action only when callers want documentation of which
// SttAction this datum is being forwarded for.


export function recipientWithOptionalInlineDatum(
  address: string,
  datum?: ConstrData
): Recipient {
  if (!datum) {
    return { address };
  }

  return {
    address,
    datum: {
      value: datum,
      inline: true
    }
  };
}



export function deriveAssetName(referenceUtxo: { txHash: string; outputIndex: number }) {
  const outputIndexHex = referenceUtxo.outputIndex.toString(16).padStart(8, "0");
  const serializedOutput = `${referenceUtxo.txHash}${outputIndexHex}`;
  const bytes = hexToBytes(serializedOutput);

  return bytesToHex(blake2b(bytes, 32));
}



export function normalizeMintStarterAssets(
  starterAssets: Asset[] | undefined,
  fallbackLovelace: string | undefined
) {
  const fallbackAmount = fallbackLovelace?.trim() || DEFAULT_MINT_STT_LOVELACE;

  if (!/^\d+$/.test(fallbackAmount)) {
    throw new Error("Mint lovelace must be a non-negative integer string.");
  }

  const source =
    starterAssets && starterAssets.length > 0
      ? starterAssets
      : [{ unit: "lovelace", quantity: fallbackAmount }];
  const totals = new Map<string, bigint>();

  source.forEach((asset, index) => {
    const unit = asset.unit.trim();
    const quantityText = asset.quantity.trim();

    if (!unit && !quantityText) {
      return;
    }

    if (!unit || !quantityText) {
      throw new Error(`Starter funds row ${index + 1} must include an asset and amount.`);
    }

    if (!/^\d+$/.test(quantityText)) {
      throw new Error(`Starter funds row ${index + 1} must use a whole-number amount.`);
    }

    const quantity = BigInt(quantityText);

    if (quantity === 0n) {
      if (unit === "lovelace" && !totals.has("lovelace")) {
        totals.set("lovelace", 0n);
      }
      return;
    }

    totals.set(unit, (totals.get(unit) ?? 0n) + quantity);
  });

  if (totals.size === 0) {
    totals.set("lovelace", BigInt(fallbackAmount));
  }

  const hasNativeAssets = [...totals.keys()].some((unit) => unit !== "lovelace");
  if (starterAssets && starterAssets.length > 0 && hasNativeAssets && !totals.has("lovelace")) {
    totals.set("lovelace", 0n);
  }

  return [...totals.entries()]
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



export function summarizeAmountForTxPreview(amount: Asset[]) {
  const lovelace = getLovelaceQuantity(amount).toString();
  const nativeAssetCount = amount.filter(
    (asset) => asset.unit !== "lovelace" && BigInt(asset.quantity) > 0n
  ).length;

  if (nativeAssetCount === 0) {
    return `${lovelace} lovelace`;
  }

  return `${lovelace} lovelace and ${nativeAssetCount} native asset${
    nativeAssetCount === 1 ? "" : "s"
  }`;
}


