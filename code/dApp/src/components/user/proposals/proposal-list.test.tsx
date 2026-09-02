import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ComponentProps } from "react";
import { ProposalList } from "./proposal-list";
import type {
  ProposalListItemDto,
  ProposalValidity,
  SignerSatisfaction
} from "@/lib/proposals/types";

function listItem(overrides: Partial<ProposalListItemDto> = {}): ProposalListItemDto {
  return {
    id: "proposal-1",
    walletUnit: `${"aa".repeat(28)}01`,
    walletPolicyId: "aa".repeat(28),
    title: "Raise the daily limit",
    description: null,
    actionKind: "update-state",
    authorityPath: "multisig",
    status: "OPEN",
    txBodyHash: "bb".repeat(32),
    submittedTxHash: null,
    createdByKeyHash: "cc".repeat(28),
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    signatureCount: 1,
    signerKeyHashes: ["a".repeat(56)],
    ...overrides
  };
}

const SIGNERS: SignerSatisfaction = {
  authorityPath: "multisig",
  requiredSigners: [
    { keyHash: "a".repeat(56), power: 2, isAdmin: false },
    { keyHash: "b".repeat(56), power: 2, isAdmin: false },
    { keyHash: "c".repeat(56), power: 1, isAdmin: false }
  ],
  signedKeyHashes: ["a".repeat(56)],
  satisfiedPower: 2,
  threshold: 3,
  satisfied: false
};

function renderList(
  report?: { validity: ProposalValidity; signers: SignerSatisfaction | null },
  overrides: Partial<ComponentProps<typeof ProposalList>> = {}
) {
  return render(
    <ProposalList
      proposals={[listItem()]}
      selectedId={null}
      reportById={report ? { "proposal-1": report } : {}}
      loading={false}
      loadingMore={false}
      hasMore={false}
      error={null}
      onSelect={() => {}}
      onRefresh={() => {}}
      onLoadMore={() => {}}
      {...overrides}
    />
  );
}

describe("the approval queue row", () => {
  it("marks a request that is on its way to the chain", () => {
    // The row stays SUBMITTING when the chain accepted the tx but the record did
    // not finish; "Open" would invite the proposer to make a new version.
    renderList(undefined, { proposals: [listItem({ status: "SUBMITTING" })] });
    expect(screen.getByText("Sending")).toBeTruthy();
    expect(screen.queryByText("Open")).toBeNull();
  });

  it("says how much approval power is in and how much is needed", () => {
    renderList({ validity: "valid", signers: SIGNERS });
    expect(screen.getByText("2 of 3 approval power")).toBeTruthy();
    expect(screen.getByText("2 people still to sign.")).toBeTruthy();
  });

  it("names the path in the words the rest of the app uses", () => {
    renderList({ validity: "valid", signers: SIGNERS });
    expect(screen.getByText("Co-signers")).toBeTruthy();
    expect(screen.queryByText("multisig")).toBeNull();
  });

  it("falls back to the signature count while verification is still running", () => {
    renderList({ validity: "checking", signers: null });
    expect(screen.getByText("1 signature")).toBeTruthy();
    expect(screen.queryByText(/still to sign/)).toBeNull();
  });
});

describe("the approval queue column", () => {
  /**
   * The page `<h1>` already says "Approval requests" and this list column says "Requests";
   * the nav deliberately names the activity ("Co-signing") instead of the object. A heading
   * here calling the same things "Proposals" would put two object vocabularies on one screen.
   */
  it("does not introduce a second name for approval requests", () => {
    renderList();
    expect(screen.getByRole("heading", { name: "Requests" })).toBeTruthy();
    expect(screen.queryByText("Proposals")).toBeNull();
  });

  /**
   * The badge read "Invalid — rebuild": an em dash, plus the word for what an engineer does
   * about it rather than what happened. What happened is that the transaction spends funds
   * that have since moved, so it can no longer be submitted.
   */
  it("says an unusable request is out of date, without jargon or a dash", () => {
    const { container } = renderList({ validity: "invalid", signers: SIGNERS });
    expect(screen.getByText("Out of date")).toBeTruthy();
    expect(screen.queryByText(/rebuild/i)).toBeNull();
    expect(container.textContent).not.toMatch(/[—–]/);
  });

  /** Which request is open was carried by a border colour and nothing else. */
  it("marks the open request as the current one", () => {
    renderList(undefined, { selectedId: "proposal-1" });
    expect(screen.getByRole("button", { name: /Raise the daily limit/ })).toHaveAttribute(
      "aria-current",
      "true"
    );
  });

  it("leaves every other request without a current marker", () => {
    renderList(undefined, { selectedId: "proposal-2" });
    expect(
      screen.getByRole("button", { name: /Raise the daily limit/ })
    ).not.toHaveAttribute("aria-current");
  });

  /** The error follows a Refresh the user pressed, so silence is the wrong response. */
  it("announces a failure to load the list", () => {
    renderList(undefined, { error: "Could not load approval requests." });
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load approval requests.");
  });

  /**
   * A request the app never managed to check is not a request it found fault with. The
   * badge for it carries no icon and no colour, because it is the absence of an answer.
   */
  it("does not paint a verdict on a request it could not check", () => {
    renderList({ validity: "unknown", signers: null });
    expect(screen.getByText("Not checked")).toBeTruthy();
    expect(screen.queryByText("Out of date")).toBeNull();
    expect(screen.queryByText("Checking")).toBeNull();
  });

  /** "Build a transaction" with no place named leaves the reader on the wrong page. */
  it("says where an approval request comes from", () => {
    renderList(undefined, { proposals: [] });
    expect(screen.getByText(/Build a transaction on the wallet page/)).toBeTruthy();
  });
});
