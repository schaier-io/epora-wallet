import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ProposalCapture } from "@/components/user/proposals/stash";
import { createDefaultStateForm } from "@/lib/contracts/state-form";
import type { ProposalBuildContext } from "@/lib/proposals/types";
import { createProposalCaptureWriter } from "./workspace-proposal-capture";

const buildContext = {
  builder: "wallet-vote",
  config: {},
  input: {}
} as unknown as ProposalBuildContext;

describe("createProposalCaptureWriter", () => {
  it("captures the selected authority and a detached state snapshot", () => {
    const stateForm = createDefaultStateForm();
    const proposalCaptureRef: { current: ProposalCapture | null } = { current: null };
    const capture = createProposalCaptureWriter({
      activePaymentKeyHash: "11".repeat(28),
      proposalCaptureRef,
      stateForm,
      walletAssetNameHex: "74657374",
      walletPolicyId: "22".repeat(28)
    });

    capture("wallet-vote", "multisig", buildContext);
    stateForm.walletName = "changed after capture";

    assert.deepEqual(
      {
        actionKind: proposalCaptureRef.current?.actionKind,
        authorityPath: proposalCaptureRef.current?.authorityPath,
        builder: proposalCaptureRef.current?.builder,
        buildContext: proposalCaptureRef.current?.buildContext,
        proposerKeyHash: proposalCaptureRef.current?.proposerKeyHash,
        walletUnit: proposalCaptureRef.current?.walletUnit
      },
      {
      actionKind: "wallet-vote",
      authorityPath: "multisig",
      builder: "wallet-vote",
      buildContext,
      proposerKeyHash: "11".repeat(28),
      walletUnit: `${"22".repeat(28)}74657374`
      }
    );
    assert.notEqual(
      proposalCaptureRef.current?.stateForm?.walletName,
      "changed after capture"
    );
  });

  it("does not capture without a complete wallet unit", () => {
    const proposalCaptureRef: { current: ProposalCapture | null } = { current: null };
    const capture = createProposalCaptureWriter({
      activePaymentKeyHash: null,
      proposalCaptureRef,
      stateForm: createDefaultStateForm(),
      walletAssetNameHex: "",
      walletPolicyId: "22".repeat(28)
    });

    capture("wallet-vote", "multisig", buildContext);

    assert.equal(proposalCaptureRef.current, null);
  });
});
