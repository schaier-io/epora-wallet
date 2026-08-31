import { STT_SPEND_VALIDATOR } from "./constants";
import { resolveSttScriptParams } from "./core";
import { withStage } from "./errors";
import {
  buildReferenceScriptDiagnostics,
  describeReferenceScriptUsage,
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

type StateForwardingInput = StateForwardingDefinition & {
  input: UTxO;
  inputRef: string;
};

type ResolvedStateForwardingInput = StateForwardingInput & {
  referenceScript: ReferenceScriptResolution;
  witness: {
    label: "STT";
    script: PlutusScript;
    reference: ReferenceScriptResolution;
  };
};

type StateForwardingWitness = {
  label: string;
  script: { code: string };
  reference?: ReferenceScriptResolution | null;
};

type StateForwardingOutput = {
  assets: Asset[];
  datum: ConstrData;
};

type StateForwardingPlanBase = {
  redeemer: ConstrData;
  budget?: Budget;
  additionalWitnesses?: StateForwardingWitness[];
  afterRedeem?: () => Promise<void> | void;
  afterOutput?: () => Promise<void> | void;
};

type StateForwardingPlan = StateForwardingPlanBase &
  (
    | (StateForwardingOutput & { createOutput?: never })
    | {
        assets?: never;
        datum?: never;
        createOutput: () => Promise<StateForwardingOutput> | StateForwardingOutput;
      }
  );

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

async function resolveStateForwardingInput(
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

async function resolveStateForwardingReference(
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

function redeemStateForwardingInput(options: {
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

function sendStateForwardingOutput(options: {
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

export async function runStateForwarding<T>(options: {
  definition: StateForwardingDefinition;
  fetcher: TxFetcher;
  tx: Transaction;
  input: {
    txHash: string;
    outputIndex?: number;
    stage: string;
    details?: Record<string, unknown>;
  };
  reference: {
    stage: string;
    details?: Record<string, unknown>;
  };
  spendValidatorsByRef: Map<string, string>;
  afterInput: (context: {
    input: StateForwardingInput;
    fetcher: TxFetcher;
  }) => Promise<T> | T;
  beforeRedeem: (context: {
    input: StateForwardingInput;
    resolved: ResolvedStateForwardingInput;
    fetcher: TxFetcher;
    tx: Transaction;
    value: T;
  }) => Promise<StateForwardingPlan> | StateForwardingPlan;
}) {
  const {
    definition,
    fetcher,
    tx,
    input: inputOptions,
    reference,
    spendValidatorsByRef,
    afterInput,
    beforeRedeem
  } = options;
  const input = await resolveStateForwardingInput(
    definition,
    fetcher,
    inputOptions
  );
  const value = await afterInput({ input, fetcher });
  const resolved = await resolveStateForwardingReference(input, fetcher, reference);
  const plan = await beforeRedeem({ input, resolved, fetcher, tx, value });
  const scriptWitnessDiagnostics = buildReferenceScriptDiagnostics([
    resolved.witness,
    ...(plan.additionalWitnesses ?? [])
  ]);

  redeemStateForwardingInput({
    tx,
    resolved,
    redeemer: plan.redeemer,
    budget: plan.budget,
    spendValidatorsByRef
  });
  await plan.afterRedeem?.();
  const output = plan.createOutput
    ? await plan.createOutput()
    : { assets: plan.assets, datum: plan.datum };
  sendStateForwardingOutput({
    tx,
    resolved,
    assets: output.assets,
    datum: output.datum
  });
  await plan.afterOutput?.();

  return {
    input,
    resolved,
    value,
    diagnostics: {
      sttAddress: definition.address,
      scriptWitnessDiagnostics
    },
    referenceScriptUsage: describeReferenceScriptUsage(scriptWitnessDiagnostics)
  };
}
