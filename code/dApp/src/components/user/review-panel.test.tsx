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
  buildErrorExpected: false,
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

  it("does not expose the internal transaction preview summary", () => {
    render(
      <UserReviewPanel
        {...BASE}
        preview={{
          txHex: "00",
          preview: {
            action: "use",
            summary: "action=use; funding=smart-wallet; selectedFundPools=1",
            cbor: "00"
          },
          estimatedFeeLovelace: "1000",
          warnings: []
        }}
        previewMatchesSelectedAction
      />
    );

    expect(screen.queryByText("Technical summary")).not.toBeInTheDocument();
    expect(screen.queryByText(/selectedFundPools=/)).not.toBeInTheDocument();
  });

  it("gives unexpected failures a diagnostic reference instead of console instructions", () => {
    render(
      <UserReviewPanel
        {...BASE}
        buildError="Something went wrong while preparing this transaction."
        buildErrorExpected={false}
        buildDiagnosticId="abc-1234"
      />
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Diagnostic reference");
    expect(alert).toHaveTextContent("abc-1234");
    expect(alert.textContent).not.toContain("browser console");
  });

  /**
   * The serialized error used to render inside a "Debug details" disclosure under the
   * message (and clipped on small screens). It now goes to the browser console only, so
   * the rail must never print it — however the error is toned.
   */
  it("never renders a debug payload, and tones a declined signature calmly", () => {
    const declined = render(
      <UserReviewPanel
        {...BASE}
        buildErrorExpected
        buildError="You declined to sign in your wallet, so nothing was sent."
      />
    );
    const calm = screen.getByRole("alert");
    expect(calm.className).toContain("bg-sky-500/10");
    expect(calm.className).not.toContain("bg-rose-500/10");
    expect(calm.textContent).not.toContain("Debug details");
    declined.unmount();

    render(
      <UserReviewPanel
        {...BASE}
        buildError="Something went wrong while preparing this transaction."
      />
    );
    const alarm = screen.getByRole("alert");
    expect(alarm.className).toContain("bg-rose-500/10");
    expect(alarm.className).not.toContain("bg-sky-500/10");
  });

  it("announces a submitted transaction politely", () => {
    render(<UserReviewPanel {...BASE} submitHash={"ab".repeat(32)} />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Transaction submitted");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  /**
   * The confirming note used to spin forever: nothing watched the chain, so "your
   * balance updates after the next block" was a promise no code kept. When the
   * post-submit poll sees the hash, the banner flips to a confirmed headline and
   * stops spinning.
   */
  it("resolves the submitted banner to confirmed once the tx is seen on chain", () => {
    render(<UserReviewPanel {...BASE} submitHash={"ab".repeat(32)} submitConfirmed />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Transaction confirmed");
    expect(status.querySelector(".animate-spin")).toBeNull();
  });

  /**
   * Ten labels in the rail hand-rolled an eyebrow at `text-xs uppercase tracking-wide`, which
   * is 12px with 0.025em of tracking, while the `.eyebrow` class is 11px at 0.16em.
   * The sidebar was settled onto the same rung in C4.
   */
  it("puts its labels on the eyebrow rung", () => {
    render(<UserReviewPanel {...BASE} />);

    const nextStep = screen.getByText("Next step");
    expect(nextStep.className).toContain("eyebrow");
    expect(nextStep.className).not.toContain("uppercase");
  });

  /**
   * The Card is `rounded-xl`, so a callout inside it that is also `rounded-xl` reads as
   * floating loose rather than nested. Its amber and rose siblings were already `rounded-lg`.
   * The same block carried an em dash, which is banned in shipped copy.
   */
  it("nests the submitted callout inside the Card", () => {
    render(<UserReviewPanel {...BASE} submitHash={"ab".repeat(32)} />);

    const status = screen.getByRole("status");
    expect(status.className).toContain("rounded-lg");
    expect(status.className).not.toContain("rounded-xl");
    expect(status.textContent).toContain("Confirming on-chain. Your balance updates");
    expect(status.textContent).not.toContain("\u2014");
  });

  const ISSUES: Pick<ComponentProps<typeof UserReviewPanel>, "readinessIssues" | "fieldErrors"> = {
    readinessIssues: [
      {
        id: "no-wallet",
        label: "Receive address",
        description: "Choose a smart wallet first.",
        recovery: "Open a wallet from the sidebar.",
        status: "error",
        blocking: true
      }
    ],
    fieldErrors: { "Payout address": ["This field is required."] }
  };

  /**
   * Readiness and field errors are recomputed on every keystroke. `role="alert"` is
   * assertive and would cut across the user mid-word each time one appeared or cleared,
   * so the list carries `aria-live="polite"` instead and must NOT be an alert.
   */
  it("keeps the typing-driven list polite, not assertive", () => {
    const { container } = render(<UserReviewPanel {...BASE} {...ISSUES} />);

    expect(screen.queryByRole("alert")).toBeNull();

    const polite = Array.from(container.querySelectorAll('[aria-live="polite"]'));
    expect(polite).toHaveLength(1);
    expect(polite[0]).toHaveTextContent("Something needs attention");
    expect(polite[0]).toHaveTextContent("Receive address: Choose a smart wallet first.");
    expect(polite[0]).toHaveTextContent("To clear this: Open a wallet from the sidebar.");
    expect(polite[0]).toHaveTextContent("Payout address: This field is required.");
  });

  /**
   * Readiness blockers and field errors used to render as two amber boxes with two
   * headings ("Something needs attention", "Fix these fields first"), so one form said
   * "something is wrong" twice. One list, one heading; the build error keeps its own
   * alert because it is an event, not a running commentary on the form.
   */
  it("merges readiness and field issues into one list", () => {
    render(
      <UserReviewPanel {...BASE} {...ISSUES} buildError="Not enough ADA to cover the fee." />
    );

    expect(screen.getAllByText("Something needs attention")).toHaveLength(1);
    expect(screen.queryByText("Fix these fields first")).toBeNull();
    expect(screen.queryByText("Show all issues")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("Not enough ADA to cover the fee.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("Payout address");
  });

  it("hides the form's issues once the transaction is submitted", () => {
    render(<UserReviewPanel {...BASE} {...ISSUES} submitHash={"ab".repeat(32)} />);

    expect(screen.queryByText("Something needs attention")).toBeNull();
    expect(screen.queryByText("Payout address: This field is required.")).toBeNull();
  });

  it("shows the success copy without an ASCII receipt", () => {
    const { container } = render(
      <UserReviewPanel
        {...BASE}
        submitHash={"ab".repeat(32)}
        completion={{
          title: "Funds sent",
          description: "The wallet confirmed the payout.",
          statusLabel: "Confirming",
          progress: 40
        }}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("Funds sent");
    expect(container.querySelector("pre")).toBeNull();
    expect(screen.queryByText(/WALLET OK/)).toBeNull();
  });

  /**
   * The rail used to print the primary issue's description twice: once as the "Next step",
   * once in the attention box right below it. On the send page with nothing staged the
   * same "Add a payout…" sentence then appeared a third time as the section's inline
   * hint. The draft's authored step owns "what to do next"; the box owns "what is wrong".
   */
  it("gives the next-step line to the draft and the issue description to the box", () => {
    render(
      <UserReviewPanel
        {...BASE}
        draftNextStep="Add a payout: pick a recipient and an amount."
        readinessIssues={[
          {
            id: "no-payout",
            label: "Payouts",
            description: "No payout is staged yet.",
            status: "error",
            blocking: true
          }
        ]}
      />
    );

    expect(screen.getByText("Add a payout: pick a recipient and an amount.")).toBeInTheDocument();
    expect(screen.getAllByText("No payout is staged yet.")).toHaveLength(1);
  });
});

/**
 * The receipt heading shipped as a hardcoded English prop default, so no catalog could ever
 * translate it. The default now resolves through the ComponentsUserReviewPanel namespace,
 * and this renders without a `receiptTitle` to pin the catalog value as the fallback.
 */
describe("review rail receipt heading", () => {
  it("falls back to the catalog title when the caller passes none", () => {
    render(
      <UserReviewPanel
        {...BASE}
        receiptItems={[{ label: "Recipient", value: "addr_test1..." }]}
      />
    );

    expect(screen.getByText("What will happen")).toBeInTheDocument();
  });
});
