import type { UserActionKind } from "@/components/user/flow-types";

export type ReviewSubmitState = {
  /** The submitted tx left the workspace ready to run the same action again. */
  repeatable: boolean;
  /** The primary button reads "Done". */
  showsDone: boolean;
  /** Pressing "Done" clears the submitted banner and re-arms the rail. */
  awaitingAcknowledgement: boolean;
  /** "Done" stays disabled: another surface owns the after-state. */
  doneLocked: boolean;
};

/**
 * What the review rail's primary button means after a submit.
 *
 * Repeatable actions clear what they staged at submit, so the button goes back
 * to its own label and the readiness gates hold it shut until something new is
 * staged. A one-shot action (update-state, withdraw, vote, and the rest) ends at
 * "Done", which acknowledges the receipt and re-arms the rail. Every one-shot
 * action except `mint` spends the STT, so the wallet-state wait still blocks a
 * second submit until the chain confirms.
 *
 * `mint` keeps a disabled "Done": it creates one wallet, its overlay owns the
 * after-state, and clearing the hash would re-open that overlay and drop the
 * only guard against minting a second wallet from the same form.
 */
export function resolveReviewSubmitState(
  submitHash: string | null,
  selectedAction: UserActionKind,
  preparationActive: boolean
): ReviewSubmitState {
  const submitted = Boolean(submitHash);
  const repeatable =
    submitted &&
    (selectedAction === "use" ||
      selectedAction === "use-allowance" ||
      selectedAction === "use-beneficiary" ||
      selectedAction === "distribute-beneficiaries" ||
      (selectedAction === "consolidate-utxo" && preparationActive) ||
      selectedAction === "lock-funds");
  const showsDone = submitted && !repeatable;
  const doneLocked = showsDone && selectedAction === "mint";
  return {
    repeatable,
    showsDone,
    awaitingAcknowledgement: showsDone && !doneLocked,
    doneLocked
  };
}
