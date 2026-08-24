import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";

import { UserReviewPanel } from "@/components/user/review-panel";
import { USER_ACTION_DEFINITION_MAP } from "@/lib/user-flow/action-definitions";

/**
 * The rail had no `aria-live` and no `role=` at all. A build could fail, a field could be
 * rejected, or a transaction could land on chain, and a screen-reader user was told
 * nothing: the block appeared silently below the fold.
 */
const BASE: ComponentProps<typeof UserReviewPanel> = {
  definition: USER_ACTION_DEFINITION_MAP["use"],
  draftSummary: "1 payout staged",
  draftNextStep: "Review the payout, then send.",
  readinessIssues: [],
  fieldErrors: {},
  preview: null,
  previewMatchesSelectedAction: false,
  buildError: null,
  buildErrorDetails: null,
  submitHash: null,
  lastActionLabel: "use",
  isBuilding: false,
  isSubmitting: false,
  primaryActionLabel: "Send funds",
  primaryActionDisabled: false,
  onPrimaryAction: () => {}
};

describe("review rail live regions", () => {
  it("announces a build failure assertively", () => {
    render(<UserReviewPanel {...BASE} buildError="Not enough ADA to cover the fee." />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Not enough ADA to cover the fee.");
  });

  it("announces a submitted transaction politely", () => {
    render(<UserReviewPanel {...BASE} submitHash={"ab".repeat(32)} />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Transaction submitted");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  /**
   * Readiness and field errors are recomputed on every keystroke. `role="alert"` is
   * assertive and would cut across the user mid-word each time one appeared or cleared,
   * so these two carry `aria-live="polite"` instead and must NOT be alerts.
   */
  it("keeps the typing-driven blocks polite, not assertive", () => {
    const { container } = render(
      <UserReviewPanel
        {...BASE}
        readinessIssues={[
          {
            id: "no-wallet",
            label: "Receive address",
            description: "Choose a smart wallet first.",
            status: "error",
            blocking: true
          }
        ]}
        fieldErrors={{ "Payout address": ["This field is required."] }}
      />
    );

    expect(screen.queryByRole("alert")).toBeNull();

    const polite = Array.from(container.querySelectorAll('[aria-live="polite"]'));
    const texts = polite.map((node) => node.textContent ?? "");
    expect(texts.some((t) => t.includes("Something needs attention"))).toBe(true);
    expect(texts.some((t) => t.includes("Fix these fields first"))).toBe(true);
  });
});
