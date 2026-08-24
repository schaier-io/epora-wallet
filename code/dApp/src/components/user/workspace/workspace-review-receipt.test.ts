import assert from "node:assert/strict";
import test from "node:test";
import {
  computeReviewReceipt,
  type ReviewReceiptCtx
} from "@/components/user/workspace/workspace-review-receipt";
import { createDefaultStateForm } from "@/lib/contracts/state-form";
import { shortenAddress } from "@/lib/utils/explorer";

const ADDRESS_ONE =
  "addr_test1qra89xrexu3vq28g5glatk44s96mysv345rvxsve4x5uh9vvmn2lu5e2ma4eavm9sx3jk5unu0n8vl93k0h3lcqkauwqpcpttu";
const ADDRESS_TWO =
  "addr_test1qz7r704wjqh275anmzsln4ad9e4nwrutnmyvnd32jpzy2kal8d9m8yxj9gwg0ddh4nhj6zqwad8px7u45ljczt4ajfps72xr59";

function sendCtx(transfers: ReviewReceiptCtx["sttExtraTransfers"]): ReviewReceiptCtx {
  return {
    mintStateForm: createDefaultStateForm(),
    sttBaselineStateForm: null,
    mintStarterAssets: [],
    sttStateForm: createDefaultStateForm(),
    sttExtraTransfers: transfers,
    sttWalletInputs: [{ txHash: "ab".repeat(32), outputIndex: 0 }],
    consolidateWalletInputs: [],
    consolidateWalletOutputs: [],
    lockFundsAssets: [],
    activeActionDefinition: { label: "Send funds" },
    activeActionDraft: { ready: true },
    lockingContract: { address: "addr_test1_locking" },
    mintHasOwnerChoice: false,
    mintOwnerCount: 1,
    selectedAction: "use",
    sharedSttReferenceStoreLoading: false,
    showSharedReferenceSetup: false,
    streamingPaymentPayoutTransfers: []
  };
}

function transfer(address: string, lovelace: string) {
  return {
    address,
    amount: [{ unit: "lovelace", quantity: lovelace }],
    inlineDatum: { mode: "none" as const, customAlternative: "" }
  };
}

/**
 * The send receipt used to say `1 recipient` — a count the user could not check. The
 * destination is the one field on this screen that address-swapping malware targets, so the
 * receipt has to name it, and has to carry the full address for character-by-character
 * verification.
 */

test("a single recipient is named in the row and in the summary, not counted", () => {
  const receipt = computeReviewReceipt(sendCtx([transfer(ADDRESS_ONE, "5000000")]));

  const recipient = receipt.items.find((item) => item.label === "Recipient");
  assert.ok(recipient, "expected a Recipient row");
  assert.ok(recipient.value.includes(shortenAddress(ADDRESS_ONE)));
  assert.doesNotMatch(recipient.value, /1 recipient/);
  assert.ok(receipt.summary.includes(shortenAddress(ADDRESS_ONE)));
});

test("the full address is carried on the detail line so it can be verified", () => {
  const receipt = computeReviewReceipt(sendCtx([transfer(ADDRESS_ONE, "5000000")]));

  const recipient = receipt.items.find((item) => item.label === "Recipient");
  assert.equal(recipient?.detail, ADDRESS_ONE);
});

test("each of several recipients gets its own numbered row plus a total", () => {
  const receipt = computeReviewReceipt(
    sendCtx([transfer(ADDRESS_ONE, "5000000"), transfer(ADDRESS_TWO, "2000000")])
  );

  const first = receipt.items.find((item) => item.label === "Recipient 1");
  const second = receipt.items.find((item) => item.label === "Recipient 2");
  assert.ok((first?.value ?? "").includes(shortenAddress(ADDRESS_ONE)));
  assert.ok((second?.value ?? "").includes(shortenAddress(ADDRESS_TWO)));

  const total = receipt.items.find((item) => item.label === "Total");
  assert.ok(total, "several recipients need a total");
  // Naming a single recipient in the summary only makes sense when there is exactly one.
  assert.equal(receipt.summary.includes(shortenAddress(ADDRESS_ONE)), false);
});

test("a single recipient gets no redundant total row", () => {
  const receipt = computeReviewReceipt(sendCtx([transfer(ADDRESS_ONE, "5000000")]));
  assert.equal(
    receipt.items.some((item) => item.label === "Total"),
    false
  );
});

test("no recipient yet says what to do rather than reporting a count of zero", () => {
  const receipt = computeReviewReceipt(sendCtx([]));

  const recipient = receipt.items.find((item) => item.label === "Recipient");
  assert.equal(recipient?.tone, "warning");
  assert.doesNotMatch(recipient?.value ?? "", /0 recipients/);
  assert.match(recipient?.detail ?? "", /Add the address/);
});

/**
 * Six actions have no receipt branch of their own. The generic branch used to build its
 * sentence by lower-casing a verb-phrase label and dropping the article, so the screen
 * read "You are preparing claim staking rewards." The definition now supplies a written
 * sentence, and the generated form survives only as the fallback for an action that has
 * not been given one.
 */
test("the generic receipt prefers the action's own written summary", () => {
  const ctx: ReviewReceiptCtx = {
    ...sendCtx([]),
    selectedAction: "wallet-withdraw",
    activeActionDefinition: {
      label: "Claim staking rewards",
      receiptSummary: "You are collecting the staking rewards this wallet has earned."
    }
  };

  const receipt = computeReviewReceipt(ctx);

  assert.equal(
    receipt.summary,
    "You are collecting the staking rewards this wallet has earned."
  );
  assert.doesNotMatch(receipt.summary, /You are preparing/);
});

test("the generic receipt still falls back for an action with no written summary", () => {
  const ctx: ReviewReceiptCtx = {
    ...sendCtx([]),
    selectedAction: "wallet-withdraw",
    activeActionDefinition: { label: "Claim staking rewards" }
  };

  assert.equal(
    computeReviewReceipt(ctx).summary,
    "You are preparing claim staking rewards."
  );
});
