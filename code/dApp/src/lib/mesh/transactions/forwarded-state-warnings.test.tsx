import { beforeEach, expect, it, vi } from "vitest";

import {
  createDefaultStateForm,
  createDefaultUserFormState,
  stateFormToDatum,
  type BeneficiaryFormState,
  type StateFormState,
  type UserFormState
} from "@/lib/contracts/state-form";
import type { BuildResult, ContractConfig } from "@/lib/types/contracts";

vi.mock("./internals", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./internals")>();
  return {
    ...actual,
    addExtraRequiredSigners: vi.fn(() => []),
    buildTransactionWithReestimatedLimits: vi.fn(
      async (
        _draftStage: string,
        _finalStage: string,
        build: (overrides: undefined) => Promise<{ context?: Record<string, unknown> }>
      ) => {
        const built = await build(undefined);
        return {
          txHex: "00",
          estimatedFeeLovelace: "1",
          signerAddress: "addr_test1signer",
          executionUnits: undefined,
          context: built.context
        };
      }
    ),
    createTxPreview: vi.fn((action: string, summary: string, cbor: string) => ({
      action,
      summary,
      cbor
    })),
    createStateForwarding: vi.fn(() => ({
      address: "addr_test1state",
      params: { sttPolicyId: "aa".repeat(28), sttAssetNameHex: "01" }
    })),
    fetchChangeAddressReferenceUtxos: vi.fn(async () => []),
    runStateForwarding: vi.fn(async () => ({
      diagnostics: {},
      referenceScriptUsage: "inline",
      resolved: { inputRef: "state#0" },
      value: []
    })),
    setupTransaction: vi.fn(async () => ({
      tx: { sendAssets: vi.fn(), txBuilder: { meshTxBuilderBody: {} } },
      fetcher: {},
      changeAddress: "addr_test1signer",
      setupDiagnostics: {},
      walletUtxos: []
    }))
  };
});

vi.mock("@/lib/contracts/blueprint", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/contracts/blueprint")>();
  const script = { code: "00", version: "V3" as const };
  return {
    ...actual,
    getWalletPublishScript: vi.fn(() => script),
    getWalletSpendScript: vi.fn(() => script),
    getWalletVoteScript: vi.fn(() => script),
    getWalletWithdrawScript: vi.fn(() => script),
    resolveWalletContinuingOutputAddressFromState: vi.fn(() => "addr_test1wallet"),
    resolveWalletSpendScriptHash: vi.fn(() => "bb".repeat(28))
  };
});

import { buildConsolidateUtxosTx } from "./consolidate-utxos";
import { buildSetIntendedStakeCredentialTx } from "./set-intended-stake-credential";
import { buildWalletPublishTx, buildWalletVoteTx } from "./wallet-governance";
import { buildWalletWithdrawTx } from "./wallet-withdraw";

const KEY = "ab".repeat(28);
const CONFIG: ContractConfig = { sttAssetNameHex: "01" };
const TX_HASH = "cd".repeat(32);

function poweredUser(id: string, power: string): UserFormState {
  return {
    ...createDefaultUserFormState(id),
    wallets: [KEY],
    multiSigPowerMode: "some",
    multiSigPower: power,
    preset: "custom"
  };
}

function warningState() {
  const beneficiary: BeneficiaryFormState = {
    id: "0",
    wallets: ["ef".repeat(28)],
    unlockAfterMode: "none",
    unlockAfter: "",
    weight: "1"
  };
  const form: StateFormState = {
    ...createDefaultStateForm(),
    users: [poweredUser("0", "1"), poweredUser("1", "2")],
    multiSigThresholdMode: "some",
    multiSigThreshold: "3",
    beneficiaries: [beneficiary],
    proofOfLifeUnlockTimeMode: "some",
    proofOfLifeUnlockTime: "1",
    proofOfLifeIncrementMode: "some",
    proofOfLifeIncrement: "60"
  };
  return stateFormToDatum(form);
}

function expectSafetyWarnings(result: BuildResult) {
  expect(result.warnings).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/One signature contributes their combined power 3/),
      expect.stringMatching(/already withdraw/)
    ])
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

it("returns forwarded State warnings from every standalone State builder", async () => {
  const state = warningState();
  const shared = {
    sttInputTxHash: TX_HASH,
    sttInputOutputIndex: 0,
    sttOutputDatum: state,
    sttOutputAssets: [],
    authorityPath: "multisig" as const
  };

  const results = await Promise.all([
    buildConsolidateUtxosTx(
      {},
      CONFIG,
      {
        sttInputTxHash: TX_HASH,
        sttInputOutputIndex: 0,
        outputDatum: state,
        outputAssets: [],
        authorityPath: "multisig",
        walletInputs: [{ txHash: TX_HASH, outputIndex: 1 }]
      }
    ),
    buildSetIntendedStakeCredentialTx({}, CONFIG, {
      ...shared,
      stakeCredential: { kind: "none" }
    }),
    buildWalletWithdrawTx({}, CONFIG, {
      ...shared,
      rewardAddress: "stake_test1reward",
      amountLovelace: "1"
    }),
    buildWalletPublishTx({}, CONFIG, { ...shared, certificate: {} }),
    buildWalletVoteTx({}, CONFIG, { ...shared, vote: {} })
  ]);

  results.forEach(expectSafetyWarnings);
});
