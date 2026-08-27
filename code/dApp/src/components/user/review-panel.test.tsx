import { render, screen } from "@testing-library/react";
import { Send } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { UserReviewPanel } from "@/components/user/review-panel";
import type { TaskDefinition } from "@/components/user/flow-types";

const definition: TaskDefinition = {
  kind: "use",
  label: "Send funds",
  shortLabel: "Send",
  description: "Send funds from this wallet.",
  outcome: "Funds move to the selected recipients.",
  whenToUse: "When you need to pay someone.",
  whatChanges: "Wallet funds.",
  pathLabels: [],
  surfaceLabel: "Wallet",
  startingPoint: "Wallet",
  buildLabel: "Continue",
  icon: Send,
  prerequisites: [],
  lane: "recommended",
  group: "everyday-spending",
  risk: "low"
};

describe("UserReviewPanel", () => {
  it("renders translated field labels instead of stable validation IDs", () => {
    render(
      <UserReviewPanel
        definition={definition}
        draftSummary="One recipient"
        draftNextStep="Fix the form."
        readinessIssues={[]}
        fieldErrors={{ walletIdentityTransactionHash: ["Enter a transaction hash."] }}
        preview={null}
        previewMatchesSelectedAction={false}
        buildError={null}
        buildErrorDetails={null}
        submitHash={null}
        lastActionLabel=""
        isBuilding={false}
        isSubmitting={false}
        primaryActionLabel="Continue"
        primaryActionDisabled
        onPrimaryAction={vi.fn()}
      />
    );

    expect(screen.getByText("Wallet identity:")).toBeInTheDocument();
    expect(screen.queryByText(/walletIdentityTransactionHash/)).not.toBeInTheDocument();
  });
});
