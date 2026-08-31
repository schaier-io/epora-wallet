import { STT_SPEND_VALIDATOR } from "./constants";
import { resolveSttScriptParams } from "./core";
import { withStage } from "./errors";
import {
  type ReferenceScriptResolution,
  resolveSharedSttReferenceScript
} from "./reference-scripts";
import { createInputRefKey, resolveSttInputUtxo } from "./utxo";
import {
  redeemValueWithRequiredReferenceScript,
  sendAssetsWithOptionalInlineDatumAndReferenceScript
} from "./value";
import {
  getSttSpendScript,
  resolveScriptAddress
} from "@/lib/contracts/blueprint";
import type { TxFetcher } from "@/lib/mesh/tx-context";
import type { Asset, ConstrData, ContractConfig } from "@/lib/types/contracts";
import type { Budget } from "@meshsdk/common";
import type { PlutusScript, Transaction, UTxO } from "@meshsdk/core";

type StateScriptParams = {
  sttPolicyId: string;
  sttAssetNameHex: string;
};

export type StateForwardingDefinition = {
  params: StateScriptParams;
  script: PlutusScript;
  address: string;
  unit: string;
  configuredReference?: string;
};

export type StateForwardingInput = StateForwardingDefinition & {
  input: UTxO;
  inputRef: string;
};

export type ResolvedStateForwardingInput = StateForwardingInput & {
  referenceScript: ReferenceScriptResolution;
  witness: {
    label: "STT";
    script: PlutusScript;
    reference: ReferenceScriptResolution;
  };
};

export function createStateForwarding(
  config: ContractConfig
): StateForwardingDefinition {
  const params = resolveSttScriptParams(config);
  const script = getSttSpendScript();

  return {
    params,
    script,
    address: resolveScriptAddress(script),
    unit: `${params.sttPolicyId}${params.sttAssetNameHex}`,
    configuredReference: config.sttSpendReference
  };
}

export async function resolveStateForwardingInput(
  definition: StateForwardingDefinition,
  fetcher: TxFetcher,
  options: {
    txHash: string;
    outputIndex?: number;
    stage: string;
    details?: Record<string, unknown>;
  }
): Promise<StateForwardingInput> {
  const details = {
    ...options.details,
    sttAddress: definition.address
  };
  const stateUtxos = await withStage(
    options.stage,
    async () => fetcher.fetchAddressUTxOs(definition.address),
    details
  );
  const input = resolveSttInputUtxo(
    stateUtxos,
    options.txHash,
    options.outputIndex,
    definition.unit
  );
  const inputRef = createInputRefKey(
    input.input.txHash,
    input.input.outputIndex
  );
  return {
    ...definition,
    input,
    inputRef
  };
}

export async function resolveStateForwardingReference(
  resolvedInput: StateForwardingInput,
  fetcher: TxFetcher,
  options: {
    stage: string;
    details?: Record<string, unknown>;
  }
): Promise<ResolvedStateForwardingInput> {
  const details = {
    ...options.details,
    sttAddress: resolvedInput.address
  };
  const referenceScript = await resolveSharedSttReferenceScript(fetcher, {
    configuredReference: resolvedInput.configuredReference,
    script: resolvedInput.script,
    stage: options.stage,
    details,
    excludedRefs: [resolvedInput.inputRef]
  });

  return {
    ...resolvedInput,
    referenceScript,
    witness: {
      label: "STT",
      script: resolvedInput.script,
      reference: referenceScript
    }
  };
}

export function redeemStateForwardingInput(options: {
  tx: Transaction;
  resolved: ResolvedStateForwardingInput;
  redeemer: ConstrData;
  budget?: Budget;
  spendValidatorsByRef: Map<string, string>;
}): void {
  const {
    tx,
    resolved,
    redeemer,
    budget,
    spendValidatorsByRef
  } = options;

  spendValidatorsByRef.set(resolved.inputRef, STT_SPEND_VALIDATOR);
  redeemValueWithRequiredReferenceScript(
    tx,
    resolved.input,
    resolved.referenceScript,
    { data: redeemer, budget }
  );
}

export function sendStateForwardingOutput(options: {
  tx: Transaction;
  resolved: ResolvedStateForwardingInput;
  assets: Asset[];
  datum: ConstrData;
}): void {
  const { tx, resolved, assets, datum } = options;

  sendAssetsWithOptionalInlineDatumAndReferenceScript(
    tx,
    resolved.address,
    assets,
    datum
  );
}
