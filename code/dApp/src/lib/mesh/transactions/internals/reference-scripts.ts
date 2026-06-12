import { CARDANO_MAX_TX_SIZE_BYTES } from "./constants";
import { withStage } from "./errors";
import { formatByteCount, plutusScriptSizeBytes } from "./script-data";
import { compareInputRefs, createInputRefKey, dedupeUtxos, findUtxo } from "./utxo";
import { resolveSttReferenceStoreAddress } from "@/lib/contracts/blueprint";
import { type ServerFetcher } from "@/lib/mesh/server-fetcher";
import { type LanguageVersion } from "@meshsdk/common";
import { type UTxO, resolveScriptHash } from "@meshsdk/core";
import { fromScriptRef } from "@meshsdk/core-cst";

export type ReferenceScriptResolution = {
  utxo: UTxO;
  reference: string;
  source: string;
  scriptHash: string;
  scriptSize: string;
  validation:
    | "hash-verified"
    | "script-ref-verified"
    | "unverified-no-script-hash";
};



type SharedSttReferenceStoreInspection = {
  storeAddress: string;
  expectedScriptHash: string;
  matchingReferences: ReferenceScriptResolution[];
  staleReferenceCount: number;
  storeUtxoCount: number;
};



type MintReferenceInputResolution = {
  utxo: UTxO;
  reference: string;
  source: "selected-reference-utxo" | "wallet-first-spendable-utxo";
};



type ScriptWitnessDiagnostics = {
  scriptWitnesses: Array<{
    label: string;
    witness: "inline" | "reference";
    bytes: number;
    reference?: string;
    source?: string;
    validation?: ReferenceScriptResolution["validation"];
  }>;
  inlineScripts: Array<{ label: string; bytes: number }>;
  inlineScriptTotalBytes: number;
  referenceScriptCount: number;
  maxTxSizeBytes: number;
  exceedsMaxTxSize: boolean;
  inlineScriptSummary: string;
};



function getInlineScriptDiagnostics(
  scripts: Array<{ label: string; script: { code: string } }>
) {
  const inlineScripts = scripts.map(({ label, script }) => ({
    label,
    bytes: plutusScriptSizeBytes(script)
  }));
  const totalBytes = inlineScripts.reduce((sum, entry) => sum + entry.bytes, 0);

  return {
    inlineScripts,
    inlineScriptTotalBytes: totalBytes,
    maxTxSizeBytes: CARDANO_MAX_TX_SIZE_BYTES,
    exceedsMaxTxSize: totalBytes > CARDANO_MAX_TX_SIZE_BYTES,
    inlineScriptSummary: inlineScripts
      .map((entry) => `${entry.label} ${formatByteCount(entry.bytes)} B`)
      .join(", ")
  };
}



function parseReferenceUtxoConfig(value: string | undefined, label: string) {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^([0-9a-f]{64})(?:#|:)(\d+)$/i);
  if (!match) {
    throw new Error(`${label} must use the format txHash#index.`);
  }

  return {
    txHash: match[1]!.toLowerCase(),
    outputIndex: Number(match[2])
  };
}



export function hasReferenceScript(utxo: UTxO) {
  return typeof utxo.output.scriptRef === "string" && utxo.output.scriptRef.length > 0;
}



export function excludeReservedUtxos(utxos: UTxO[], reservedRefs: Set<string>) {
  if (reservedRefs.size === 0) {
    return utxos;
  }

  return utxos.filter(
    (utxo) =>
      !reservedRefs.has(createInputRefKey(utxo.input.txHash, utxo.input.outputIndex))
  );
}



function resolveReferenceScriptValidation(
  utxo: UTxO,
  script: { code: string; version: LanguageVersion }
): ReferenceScriptResolution["validation"] | null {
  const scriptRef = utxo.output.scriptRef;
  if (typeof scriptRef !== "string" || scriptRef.length === 0) {
    return null;
  }

  const expectedHash = resolveScriptHash(script.code, script.version);
  if (utxo.output.scriptHash) {
    return utxo.output.scriptHash === expectedHash ? "hash-verified" : null;
  }

  const parsedScript = fromScriptRef(scriptRef);
  if (!parsedScript || !("code" in parsedScript)) {
    return null;
  }

  if (parsedScript.version !== script.version) {
    return null;
  }

  return resolveScriptHash(parsedScript.code, parsedScript.version) === expectedHash
    ? "script-ref-verified"
    : null;
}



export function buildReferenceScriptDiagnostics(
  scripts: Array<{
    label: string;
    script: { code: string };
    reference?: ReferenceScriptResolution | null;
  }>
): ScriptWitnessDiagnostics {
  const scriptWitnesses = scripts.map(({ label, script, reference }) => ({
    label,
    witness: (reference ? "reference" : "inline") as "reference" | "inline",
    bytes: plutusScriptSizeBytes(script),
    reference: reference?.reference,
    source: reference?.source,
    validation: reference?.validation
  }));
  const inlineScripts = scriptWitnesses
    .filter((entry) => entry.witness === "inline")
    .map((entry) => ({
      label: entry.label,
      bytes: entry.bytes
    }));
  const inlineDiagnostics = getInlineScriptDiagnostics(
    scripts
      .filter((entry) => !entry.reference)
      .map(({ label, script }) => ({
        label,
        script
      }))
  );

  return {
    scriptWitnesses,
    inlineScripts,
    inlineScriptTotalBytes: inlineDiagnostics.inlineScriptTotalBytes,
    referenceScriptCount: scriptWitnesses.length - inlineScripts.length,
    maxTxSizeBytes: CARDANO_MAX_TX_SIZE_BYTES,
    exceedsMaxTxSize: inlineDiagnostics.exceedsMaxTxSize,
    inlineScriptSummary: inlineDiagnostics.inlineScriptSummary
  };
}



export function describeReferenceScriptUsage(diagnostics: ScriptWitnessDiagnostics) {
  if (diagnostics.referenceScriptCount === 0) {
    return "";
  }

  return ` using ${diagnostics.referenceScriptCount} reference script${diagnostics.referenceScriptCount === 1 ? "" : "s"}`;
}



export async function resolveReferenceScript(
  fetcher: ServerFetcher,
  options: {
    label: string;
    configuredReference?: string;
    script: { code: string; version: LanguageVersion };
    stage: string;
    details?: Record<string, unknown>;
    candidateSets?: Array<{ source: string; utxos: UTxO[] }>;
    excludedRefs?: string[];
  }
): Promise<ReferenceScriptResolution | null> {
  const expectedHash = resolveScriptHash(options.script.code, options.script.version);
  const scriptSize = plutusScriptSizeBytes(options.script).toString();
  const excludedRefs = new Set(options.excludedRefs ?? []);
  const configuredReference = parseReferenceUtxoConfig(
    options.configuredReference,
    `${options.label} reference script UTxO`
  );

  if (configuredReference) {
    const reference = createInputRefKey(
      configuredReference.txHash,
      configuredReference.outputIndex
    );
    if (excludedRefs.has(reference)) {
      throw new Error(
        `${options.label} reference script UTxO ${reference} is also being spent in this transaction. Use a different unspent output for the reference script.`
      );
    }

    const fetchedUtxos = await withStage(
      options.stage,
      async () => fetcher.fetchUTxOs(configuredReference.txHash, configuredReference.outputIndex),
      {
        ...options.details,
        reference
      }
    );
    const utxo = findUtxo(
      fetchedUtxos,
      configuredReference.txHash,
      configuredReference.outputIndex
    );

    if (!hasReferenceScript(utxo)) {
      throw new Error(
        `${options.label} reference script UTxO ${reference} does not contain a reference script.`
      );
    }

    const validation = resolveReferenceScriptValidation(utxo, options.script);
    if (!validation) {
      if (utxo.output.scriptHash) {
        throw new Error(
          `${options.label} reference script UTxO ${reference} points to ${utxo.output.scriptHash}, but this flow expects ${expectedHash}.`
        );
      }

      throw new Error(
        `${options.label} reference script UTxO ${reference} does not match the expected validator script.`
      );
    }

    return {
      utxo,
      reference,
      source: "configured",
      scriptHash: expectedHash,
      scriptSize,
      validation
    };
  }

  for (const candidateSet of options.candidateSets ?? []) {
    for (const utxo of dedupeUtxos(candidateSet.utxos)) {
      const reference = createInputRefKey(utxo.input.txHash, utxo.input.outputIndex);
      if (excludedRefs.has(reference)) {
        continue;
      }

      const validation = resolveReferenceScriptValidation(utxo, options.script);
      if (!validation) {
        continue;
      }

      return {
        utxo,
        reference,
        source: candidateSet.source,
        scriptHash: expectedHash,
        scriptSize,
        validation
      };
    }
  }

  return null;
}



export async function inspectSharedSttReferenceStore(
  fetcher: ServerFetcher,
  options: {
    script: { code: string; version: LanguageVersion };
    stage: string;
    details?: Record<string, unknown>;
    excludedRefs?: string[];
  }
): Promise<SharedSttReferenceStoreInspection> {
  const storeAddress = resolveSttReferenceStoreAddress();
  const storeUtxos = await withStage(
    options.stage,
    async () => fetcher.fetchAddressUTxOs(storeAddress),
    { ...options.details, storeAddress }
  );
  const expectedScriptHash = resolveScriptHash(options.script.code, options.script.version);
  const scriptSize = plutusScriptSizeBytes(options.script).toString();
  const excludedRefs = new Set(options.excludedRefs ?? []);
  const referenceStoreUtxos = dedupeUtxos(storeUtxos).filter(hasReferenceScript);
  const matchingReferences = referenceStoreUtxos
    .flatMap((utxo) => {
      const reference = createInputRefKey(utxo.input.txHash, utxo.input.outputIndex);
      if (excludedRefs.has(reference)) {
        return [];
      }

      const validation = resolveReferenceScriptValidation(utxo, options.script);
      if (!validation) {
        return [];
      }

      return [
        {
          utxo,
          reference,
          source: "shared-stt-reference-store",
          scriptHash: expectedScriptHash,
          scriptSize,
          validation
        } satisfies ReferenceScriptResolution
      ];
    })
    .sort((left, right) => compareInputRefs(left.reference, right.reference));

  return {
    storeAddress,
    expectedScriptHash,
    matchingReferences,
    staleReferenceCount: referenceStoreUtxos.length - matchingReferences.length,
    storeUtxoCount: storeUtxos.length
  };
}



export async function resolveSharedSttReferenceScript(
  fetcher: ServerFetcher,
  options: {
    configuredReference?: string;
    script: { code: string; version: LanguageVersion };
    stage: string;
    details?: Record<string, unknown>;
    excludedRefs?: string[];
  }
): Promise<ReferenceScriptResolution> {
  const configuredReference = options.configuredReference?.trim() ?? "";
  if (configuredReference.length > 0) {
    const resolved = await resolveReferenceScript(fetcher, {
      label: "Shared STT",
      configuredReference: options.configuredReference,
      script: options.script,
      stage: options.stage,
      details: options.details,
      excludedRefs: options.excludedRefs
    });

    if (!resolved) {
      throw new Error(
        "Configured STT reference override did not resolve to a usable reference script UTxO."
      );
    }

    return resolved;
  }

  const inspection = await inspectSharedSttReferenceStore(fetcher, options);

  if (inspection.matchingReferences.length > 0) {
    return inspection.matchingReferences[0]!;
  }

  throw new Error(
    `No shared STT reference script is deployed for the current validator. Create it from the wallet home or set sttSpendReference to a matching txHash#index override.`
  );
}



export function resolveMintReferenceInput(
  walletUtxos: UTxO[],
  spendableWalletUtxos: UTxO[],
  selectedReferenceUtxo?: { txHash: string; outputIndex: number }
): MintReferenceInputResolution {
  if (selectedReferenceUtxo) {
    const reference = createInputRefKey(
      selectedReferenceUtxo.txHash,
      selectedReferenceUtxo.outputIndex
    );
    const selectedSpendableUtxo = spendableWalletUtxos.find(
      (utxo) =>
        utxo.input.txHash === selectedReferenceUtxo.txHash &&
        utxo.input.outputIndex === selectedReferenceUtxo.outputIndex
    );

    if (selectedSpendableUtxo) {
      return {
        utxo: selectedSpendableUtxo,
        reference,
        source: "selected-reference-utxo"
      };
    }

    const selectedWalletUtxo = walletUtxos.find(
      (utxo) =>
        utxo.input.txHash === selectedReferenceUtxo.txHash &&
        utxo.input.outputIndex === selectedReferenceUtxo.outputIndex
    );

    if (selectedWalletUtxo && hasReferenceScript(selectedWalletUtxo)) {
      throw new Error(
        `Selected mint reference UTxO ${reference} contains a reference script and cannot be consumed as the mint reference input. Choose a normal wallet UTxO instead.`
      );
    }

    throw new Error(
      `Selected mint reference UTxO ${reference} was not found among the connected wallet's spendable UTxOs.`
    );
  }

  const fallbackUtxo = spendableWalletUtxos[0];
  if (!fallbackUtxo) {
    throw new Error("No wallet UTxOs available for mint reference selection.");
  }

  return {
    utxo: fallbackUtxo,
    reference: createInputRefKey(
      fallbackUtxo.input.txHash,
      fallbackUtxo.input.outputIndex
    ),
    source: "wallet-first-spendable-utxo"
  };
}



export async function fetchChangeAddressReferenceUtxos(
  fetcher: ServerFetcher,
  changeAddress: string,
  stage: string,
  details: Record<string, unknown>
) {
  return withStage(
    stage,
    async () => fetcher.fetchAddressUTxOs(changeAddress),
    { ...details, changeAddress }
  );
}


