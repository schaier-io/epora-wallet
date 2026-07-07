import { type Asset, type ExecutionUnitsSummary } from "@/lib/types/contracts";
import { type Budget, type Protocol } from "@meshsdk/common";
import { type Transaction, type UTxO } from "@meshsdk/core";

export type PreparedTransaction = {
  tx: Transaction;
  diagnostics: Record<string, unknown>;
  context?: Record<string, unknown>;
  executionLabels?: ExecutionValidatorLabels;
};



export type RedeemerBudgetOverrides = {
  mintBudgets: Budget[];
  rewardBudgets: Budget[];
  spendBudgetsByRef: Map<string, Budget>;
};



export type ExecutionValidatorLabels = {
  mintValidators: string[];
  rewardValidators: string[];
  spendValidatorsByRef: Map<string, string>;
};



export type ExecutionSnapshot = {
  overrides: RedeemerBudgetOverrides;
  summary: ExecutionUnitsSummary;
};



// Compatibility shim over the Mesh SDK's UNDOCUMENTED internal tx-builder
// surface (meshTxBuilderBody, _protocolParams, completeUnbalancedSync, the fee
// calculators). The off-chain budget/fee logic mutates and reads these directly,
// so the app is pinned to meshsdk@1.9.0. assertRuntimeBuilderShape() guards
// against silent drift; update this type (and the pin) together on any SDK bump.
export type RuntimeTxBuilder = Transaction["txBuilder"] & {
  selectUtxosFrom?: (inputs: UTxO[]) => unknown;
  txIn?: (
    txHash: string,
    txIndex: number,
    amount: Asset[],
    address: string,
    scriptSize?: number
  ) => RuntimeTxBuilder;
  txInCollateral?: (
    txHash: string,
    txIndex: number,
    amount?: Asset[],
    address?: string
  ) => RuntimeTxBuilder;
  setTotalCollateral?: (collateral: string) => RuntimeTxBuilder;
  setCollateralReturnAddress?: (address: string) => RuntimeTxBuilder;
  meshTxBuilderBody: {
    inputs?: Array<{
      type: string;
      txIn?: { txHash?: string; txIndex?: number };
      scriptTxIn?: {
        redeemer?: { exUnits?: Budget };
      };
    }>;
    mints?: Array<{
      type: string;
      policyId?: string;
      assetName?: string;
      redeemer?: { exUnits?: Budget };
    }>;
    withdrawals?: Array<{
      type: string;
      address?: string;
      redeemer?: { exUnits?: Budget };
    }>;
    outputs?: Array<{
      address?: string;
      amount: Asset[];
      datum?: unknown;
    }>;
    fee?: string;
    changeAddress?: string;
  };
  _protocolParams?: Protocol;
  calculateFee?: () => bigint;
  completeUnbalancedSync?: () => string;
  getActualFee?: () => bigint;
  protocolParams?: (params: Partial<Protocol>) => RuntimeTxBuilder;
};



// Fail loud if the Mesh SDK's internal builder shape drifts from what the
// budget/fee logic depends on, rather than silently corrupting fee rebalancing.
export function assertRuntimeBuilderShape(builder: RuntimeTxBuilder): void {
  const missing: string[] = [];

  if (typeof builder.meshTxBuilderBody !== "object" || builder.meshTxBuilderBody === null) {
    missing.push("meshTxBuilderBody");
  }
  if (typeof builder.completeUnbalancedSync !== "function") {
    missing.push("completeUnbalancedSync()");
  }
  if (typeof builder.calculateFee !== "function" && typeof builder.getActualFee !== "function") {
    missing.push("calculateFee()/getActualFee()");
  }

  if (missing.length > 0) {
    throw new Error(
      `Mesh SDK transaction-builder internals changed (missing: ${missing.join(", ")}). ` +
        "The off-chain budget/fee logic relies on these undocumented members and is pinned to " +
        "meshsdk@1.9.0 — update the RuntimeTxBuilder shim before bumping the SDK."
    );
  }
}
