import {
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST
} from "@meshsdk/common";
import type { UTxO } from "@meshsdk/core";
import {
  deserializeTx,
  type CstTransactionInput
} from "@/lib/mesh/cst";
import type { StateFormState } from "@/lib/contracts/state-form";
import type { TxFetcher, WalletSource } from "@/lib/mesh/tx-context";

export function describeStateShape(state: StateFormState) {
  return {
    users: state.users.length,
    userWallets: state.users.flatMap((user) => user.wallets).length,
    allowanceEntries: state.users.flatMap((user) => [
      ...user.perDayAllowance,
      ...user.remainingAllowance
    ]).length,
    beneficiaries: state.beneficiaries.length,
    beneficiaryWallets: state.beneficiaries.flatMap(
      (beneficiary) => beneficiary.wallets
    ).length,
    streamingPayments: state.streamingPayments.length
  };
}

export function assertExactJson(
  actual: unknown,
  expected: unknown,
  message: string
) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message);
  }
}

export function createFixtureFetcher(allUtxos: UTxO[]): TxFetcher {
  const byReference = new Map(
    allUtxos.map((utxo) => [
      `${utxo.input.txHash}#${utxo.input.outputIndex}`,
      utxo
    ])
  );
  return {
    fetchProtocolParameters: async () => DEFAULT_PROTOCOL_PARAMETERS,
    fetchCostModels: async () => [
      DEFAULT_V1_COST_MODEL_LIST,
      DEFAULT_V2_COST_MODEL_LIST,
      DEFAULT_V3_COST_MODEL_LIST
    ],
    fetchAddressUTxOs: async (address: string) =>
      allUtxos.filter((utxo) => utxo.output.address === address),
    fetchUTxOs: async (txHash: string, outputIndex = 0) => {
      const utxo = byReference.get(`${txHash}#${outputIndex}`);
      return utxo ? [utxo] : [];
    },
    get: async (path: string) => {
      const transaction = /^txs\/([0-9a-f]{64})\/utxos$/.exec(path);
      if (transaction) {
        return {
          outputs: allUtxos
            .filter((utxo) => utxo.input.txHash === transaction[1])
            .map((utxo) => ({ output_index: utxo.input.outputIndex, consumed_by_tx: null }))
        };
      }
      return {
        cost_models_raw: {
          PlutusV1: DEFAULT_V1_COST_MODEL_LIST,
          PlutusV2: DEFAULT_V2_COST_MODEL_LIST,
          PlutusV3: DEFAULT_V3_COST_MODEL_LIST
        }
      };
    },
    // Mesh needs provisional ExUnits to balance the unsigned transaction. The
    // native Aiken simulation measures both compiled validators independently.
    evaluateTx: async (txHex: string) =>
      (deserializeTx(txHex).witnessSet().redeemers()?.values() ?? []).map(
        (redeemer) => ({
          index: Number(redeemer.index()),
          tag: "SPEND",
          budget: { mem: 7_000_000, steps: 4_500_000_000 }
        })
      )
  } as unknown as TxFetcher;
}

export function createFixtureWallet(
  fundingUtxo: UTxO,
  collateralUtxo: UTxO
): WalletSource {
  return {
    getUtxos: async () => [fundingUtxo, collateralUtxo],
    getChangeAddress: async () => fundingUtxo.output.address,
    getUsedAddresses: async () => [fundingUtxo.output.address],
    getUnusedAddresses: async () => []
  };
}

export function describeScriptInputs(
  transaction: ReturnType<typeof deserializeTx>,
  transactionInputs: CstTransactionInput[],
  scriptByInputReference: Map<string, string>
) {
  return Array.from(transaction.witnessSet().redeemers()?.values() ?? []).map(
    (redeemer) => {
      if (redeemer.tag() !== 0) {
        throw new Error(`Expected only Spend redeemers, found tag ${redeemer.tag()}.`);
      }
      const input = transactionInputs[Number(redeemer.index())];
      if (!input) {
        throw new Error(`Spend[${redeemer.index()}] has no matching transaction input.`);
      }
      const inputReference = `${input.transactionId().toString()}#${input.index()}`;
      const script = scriptByInputReference.get(inputReference);
      if (!script) {
        throw new Error(
          `Spend[${redeemer.index()}] does not identify a fixture script input.`
        );
      }
      return {
        tag: "Spend",
        index: Number(redeemer.index()),
        inputReference,
        script
      };
    }
  );
}
