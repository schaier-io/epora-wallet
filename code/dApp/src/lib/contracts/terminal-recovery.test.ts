import assert from "node:assert/strict";
import test from "node:test";
import type { UTxO } from "@meshsdk/core";
import {
  assertTerminalRecoveryIsComplete,
  isTerminalBeneficiaryWithdrawal,
  TERMINAL_RECOVERY_WARNING
} from "@/lib/contracts/terminal-recovery";
import { hasReachableStateAccessPath } from "@/lib/contracts/state-validation";
import {
  createDefaultStateForm,
  stateFormToDatum
} from "@/lib/contracts/state-form";
import { deriveBeneficiaryWithdrawalStateDatum } from "@/lib/mesh/transactions/internals/datum";
import { validateForwardedStateDatum } from "@/lib/mesh/transactions/internals/guards";

const HASH = "aa".repeat(32);
const PAYOUT_ADDRESS =
  "addr_test1qra89xrexu3vq28g5glatk44s96mysv345rvxsve4x5uh9vvmn2lu5e2ma4eavm9sx3jk5unu0n8vl93k0h3lcqkauwqpcpttu";
const WALLET_PAYMENT_SCRIPT_HASH =
  "4fff649fb4372ec3c408b6f0468d74e4d319904cde27fd3f00910a52";
const WALLET_ENTERPRISE_ADDRESS =
  "addr_test1wp8l7eylksmjas7ypzm0q35dwnjdxxvsfn0z0lflqzgs55stpd682";
const WALLET_BASE_ADDRESS =
  "addr_test1zp8l7eylksmjas7ypzm0q35dwnjdxxvsfn0z0lflqzgs55kamhwamhwamhwamhwamhwamhwamhwamhwamhwamhwamhwsapc9lt";

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
      address: WALLET_ENTERPRISE_ADDRESS,
      amount: [
        { unit: "lovelace", quantity: "3000000" },
        { unit: "cc".repeat(28), quantity: "4" }
      ]
    }
  } as UTxO;
}

test("last beneficiary removal is recognized as terminal only when no other path remains", () => {
  const { input, output } = terminalStates();
  assert.equal(hasReachableStateAccessPath(output), false);
  assert.equal(isTerminalBeneficiaryWithdrawal(input, output), true);
  // Assert the two promises the user has to read, not the wording. Whoever edits this
  // string next must keep saying that it cannot be undone and that later deposits are lost.
  assert.match(TERMINAL_RECOVERY_WARNING, /permanent/i);
  assert.match(TERMINAL_RECOVERY_WARNING, /funds sent later/i);
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
        walletPaymentScriptHash: WALLET_PAYMENT_SCRIPT_HASH,
        walletOutputs: [],
        transfers: []
      }),
    /must consume every UTxO/
  );
});

test("terminal recovery rejects multiple credential UTxOs", () => {
  const { input } = terminalStates();
  assert.throws(
    () =>
      assertTerminalRecoveryIsComplete({
        inputStateDatum: input,
        selectedWalletInputs: [],
        credentialWideWalletRefs: [
          { txHash: HASH, outputIndex: 0 },
          { txHash: HASH, outputIndex: 1 }
        ],
        walletPaymentScriptHash: WALLET_PAYMENT_SCRIPT_HASH,
        walletOutputs: [],
        transfers: []
      }),
    /supports at most one wallet fund pool/
  );
});

test("terminal recovery accepts an empty wallet credential", () => {
  assert.doesNotThrow(() =>
    assertTerminalRecoveryIsComplete({
      inputStateDatum: terminalStates().input,
      selectedWalletInputs: [],
      credentialWideWalletRefs: [],
      walletPaymentScriptHash: WALLET_PAYMENT_SCRIPT_HASH,
      walletOutputs: [],
      transfers: []
    })
  );
});

test("terminal recovery counts duplicate credential refs once", () => {
  const utxo = walletUtxo();
  assert.doesNotThrow(() =>
    assertTerminalRecoveryIsComplete({
      inputStateDatum: terminalStates().input,
      selectedWalletInputs: [utxo],
      credentialWideWalletRefs: [
        { txHash: HASH, outputIndex: 0 },
        { txHash: HASH.toUpperCase(), outputIndex: 0 }
      ],
      walletPaymentScriptHash: WALLET_PAYMENT_SCRIPT_HASH,
      walletOutputs: [],
      transfers: [{ address: PAYOUT_ADDRESS, amount: utxo.output.amount }]
    })
  );
});

test("terminal recovery rejects active schedules, continuing outputs, and partial value", () => {
  const utxo = walletUtxo();
  const base = {
    selectedWalletInputs: [utxo],
    credentialWideWalletRefs: [{ txHash: HASH, outputIndex: 0 }],
    walletPaymentScriptHash: WALLET_PAYMENT_SCRIPT_HASH,
    walletOutputs: [],
    transfers: [{ address: PAYOUT_ADDRESS, amount: utxo.output.amount }]
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
      transfers: [{ address: PAYOUT_ADDRESS, amount: [{ unit: "lovelace", quantity: "1" }] }]
    }),
    /complete value/
  );
});

test("terminal recovery rejects every output at the wallet payment credential", () => {
  const utxo = walletUtxo();
  const base = {
    inputStateDatum: terminalStates().input,
    selectedWalletInputs: [utxo],
    credentialWideWalletRefs: [{ txHash: HASH, outputIndex: 0 }],
    walletPaymentScriptHash: WALLET_PAYMENT_SCRIPT_HASH,
    walletOutputs: []
  };

  for (const address of [WALLET_ENTERPRISE_ADDRESS, WALLET_BASE_ADDRESS]) {
    assert.throws(
      () =>
        assertTerminalRecoveryIsComplete({
          ...base,
          transfers: [{ address, amount: utxo.output.amount }]
        }),
      /cannot transfer assets back to the wallet payment credential/
    );
  }
});

test("terminal recovery accepts a complete value and credential sweep", () => {
  const utxo = walletUtxo();
  assert.doesNotThrow(() =>
    assertTerminalRecoveryIsComplete({
      inputStateDatum: terminalStates().input,
      selectedWalletInputs: [utxo],
      credentialWideWalletRefs: [{ txHash: HASH, outputIndex: 0 }],
      walletPaymentScriptHash: WALLET_PAYMENT_SCRIPT_HASH,
      walletOutputs: [],
      transfers: [{ address: PAYOUT_ADDRESS, amount: utxo.output.amount }]
    })
  );
});
