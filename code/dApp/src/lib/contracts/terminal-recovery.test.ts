import assert from "node:assert/strict";
import test from "node:test";
import type { UTxO } from "@meshsdk/core";
import {
  assertTerminalRecoveryIsComplete,
  isTerminalBeneficiaryWithdrawal,
  TERMINAL_RECOVERY_WARNING
} from "@/lib/contracts/terminal-recovery";
import {
  createDefaultStateForm,
  stateFormToDatum
} from "@/lib/contracts/state-form";
import { deriveBeneficiaryWithdrawalStateDatum } from "@/lib/mesh/transactions/internals/datum";
import { validateForwardedStateDatum } from "@/lib/mesh/transactions/internals/guards";

const HASH = "aa".repeat(32);
const PAYOUT_ADDRESS =
  "addr_test1qra89xrexu3vq28g5glatk44s96mysv345rvxsve4x5uh9vvmn2lu5e2ma4eavm9sx3jk5unu0n8vl93k0h3lcqkauwqpcpttu";

function terminalStates(withStreamingPayment = false) {
  const input = stateFormToDatum({
    ...createDefaultStateForm(),
    beneficiaries: [
      { id: "7", wallets: ["bb".repeat(28)], unlockAfterMode: "none", unlockAfter: "", weight: "1" }
    ],
    proofOfLifeUnlockTimeMode: "some",
    proofOfLifeUnlockTime: "1000",
    proofOfLifeIncrementMode: "some",
    proofOfLifeIncrement: "60",
    streamingPayments: withStreamingPayment
      ? [
          {
            id: "1",
            payoutAddress: PAYOUT_ADDRESS,
            paidOutAmount: "0",
            policyId: "",
            assetName: "",
            amountPerDay: "1",
            startDate: "0",
            endDate: "1"
          }
        ]
      : []
  });
  return {
    input,
    output: deriveBeneficiaryWithdrawalStateDatum(input, 7)
  };
}

function walletUtxo(): UTxO {
  return {
    input: { txHash: HASH, outputIndex: 0 },
    output: {
      address: "addr_test1_wallet",
      amount: [
        { unit: "lovelace", quantity: "3000000" },
        { unit: "cc".repeat(28), quantity: "4" }
      ]
    }
  } as UTxO;
}

test("last beneficiary removal is recognized as terminal only when no other path remains", () => {
  const { input, output } = terminalStates();
  assert.equal(isTerminalBeneficiaryWithdrawal(input, output), true);
  assert.match(TERMINAL_RECOVERY_WARNING, /Irreversible terminal recovery/);
  assert.doesNotThrow(() =>
    validateForwardedStateDatum(
      output,
      { kind: "beneficiary-withdrawal", beneficiaryId: 7 },
      "test",
      "invalid"
    )
  );
  assert.throws(
    () =>
      validateForwardedStateDatum(
        output,
        { kind: "proof-of-life-renewal" },
        "test",
        "invalid"
      ),
    /Add at least one owner/
  );
});

test("terminal recovery requires the credential-wide input set", () => {
  const { input } = terminalStates();
  assert.throws(
    () =>
      assertTerminalRecoveryIsComplete({
        inputStateDatum: input,
        selectedWalletInputs: [],
        credentialWideWalletRefs: [{ txHash: HASH, outputIndex: 0 }],
        walletOutputs: [],
        transfers: []
      }),
    /must consume every UTxO/
  );
});

test("terminal recovery rejects active schedules, continuing outputs, and partial value", () => {
  const utxo = walletUtxo();
  const base = {
    selectedWalletInputs: [utxo],
    credentialWideWalletRefs: [{ txHash: HASH, outputIndex: 0 }],
    walletOutputs: [],
    transfers: [{ address: "addr_test1_recipient", amount: utxo.output.amount }]
  };
  assert.throws(
    () => assertTerminalRecoveryIsComplete({ ...base, inputStateDatum: terminalStates(true).input }),
    /streaming payments remain/
  );
  assert.throws(
    () => assertTerminalRecoveryIsComplete({
      ...base,
      inputStateDatum: terminalStates().input,
      walletOutputs: [{ amount: [{ unit: "lovelace", quantity: "1" }] }]
    }),
    /cannot create a continuing wallet output/
  );
  assert.throws(
    () => assertTerminalRecoveryIsComplete({
      ...base,
      inputStateDatum: terminalStates().input,
      transfers: [{ address: "addr_test1_recipient", amount: [{ unit: "lovelace", quantity: "1" }] }]
    }),
    /complete value/
  );
});

test("terminal recovery accepts a complete value and credential sweep", () => {
  const utxo = walletUtxo();
  assert.doesNotThrow(() =>
    assertTerminalRecoveryIsComplete({
      inputStateDatum: terminalStates().input,
      selectedWalletInputs: [utxo],
      credentialWideWalletRefs: [{ txHash: HASH, outputIndex: 0 }],
      walletOutputs: [],
      transfers: [{ address: "addr_test1_recipient", amount: utxo.output.amount }]
    })
  );
});
