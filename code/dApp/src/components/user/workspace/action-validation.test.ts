import assert from "node:assert/strict";
import test from "node:test";
import {
  computeActionFieldErrors,
  type ActionFieldErrorsInput
} from "@/components/user/workspace/action-validation";
import { createDefaultStateForm } from "@/lib/contracts/state-form";
import { type Asset } from "@/lib/types/contracts";

// Only the lock-funds inputs matter here; the rest are the empty defaults the
// editors start from, so every other action's errors are ignored.
function lockFundsInput(lockFundsAssets: Asset[]): ActionFieldErrorsInput {
  return {
    activeInferredSttStateForm: createDefaultStateForm(),
    activePaymentKeyHash: null,
    consolidateAuthorityPath: "admin",
    consolidateSttAssets: [],
    consolidateSttInputHash: "",
    consolidateSttInputIndex: "",
    consolidateWalletInputs: [],
    consolidateWalletOutputs: [],
    existingWalletNames: [],
    lockFundsAssets,
    mintStarterAssets: [],
    mintStateForm: createDefaultStateForm(),
    mintZeroAdminConfirmed: false,
    voteJson: "",
    voteSttAssets: [],
    voteSttInputHash: "",
    voteSttInputIndex: "",
    voteSttStateForm: createDefaultStateForm(),
    voteZeroAdminConfirmed: false,
    publishCertificateJson: "",
    publishSttAssets: [],
    publishSttInputHash: "",
    publishSttInputIndex: "",
    publishSttStateForm: createDefaultStateForm(),
    publishZeroAdminConfirmed: false,
    selectedDetectedToken: null,
    selectedDetectedTokenStateForm: null,
    streamingPaymentPayoutRows: [],
    streamingPaymentPayoutTransfers: [],
    sttAuthorityPath: "admin",
    sttExtraTransfers: [],
    sttInputOutputIndex: "",
    sttInputTxHash: "",
    sttOutputAssets: [],
    sttProofOfLifeOverrideMode: "unchanged",
    sttProofOfLifeSpecificDateTime: "",
    sttStateForm: createDefaultStateForm(),
    updateStateForm: createDefaultStateForm(),
    sttWalletInputs: [],
    sttWalletOutputs: [],
    sttZeroAdminConfirmed: false,
    useAllowancePreview: { error: null },
    walletOperatorPath: "admin",
    withdrawAmount: "",
    withdrawRewardAddress: "",
    withdrawSttAssets: [],
    withdrawSttInputHash: "",
    withdrawSttInputIndex: "",
    withdrawSttStateForm: createDefaultStateForm(),
    withdrawZeroAdminConfirmed: false
  } as unknown as ActionFieldErrorsInput;
}

function lockFundsErrors(assets: Asset[]) {
  return computeActionFieldErrors(lockFundsInput(assets))["lock-funds"];
}

// A row added from the asset picker starts at quantity "0", and the row check
// accepts 0 as a non-negative integer, so lock-funds read as ready with nothing
// to lock. Mint already closes the same hole on its starter funds.
test("locking a zero amount is reported, not built", () => {
  const errors = lockFundsErrors([{ unit: "lovelace", quantity: "0" }]);

  assert.deepEqual(errors["Assets to lock"], ["Add at least one amount greater than zero."]);
});

test("an empty editor asks for a row, and only that", () => {
  const errors = lockFundsErrors([]);

  assert.deepEqual(errors["Assets to lock"], ["Add at least one asset row."]);
});

// `DEFAULT_LOCK_ASSETS` seeds one ADA row with a blank amount, so the editor's own
// starting state printed two rose lines at once: the row check named the row, and the
// generic positive-amount check repeated the same complaint. One empty box, one message.
test("the seeded blank amount row reports one problem, not two", () => {
  const errors = lockFundsErrors([{ unit: "lovelace", quantity: "" }]);

  assert.deepEqual(errors["Assets to lock"], ["Complete asset row 1 before you continue."]);
});

test("a positive amount passes", () => {
  const errors = lockFundsErrors([{ unit: "lovelace", quantity: "5000000" }]);

  assert.equal(errors["Assets to lock"], undefined);
});

test("one positive row carries a zero row alongside it", () => {
  const errors = lockFundsErrors([
    { unit: "lovelace", quantity: "0" },
    { unit: `${"ab".repeat(28)}746f6b656e`, quantity: "10" }
  ]);

  assert.equal(errors["Assets to lock"], undefined);
});
