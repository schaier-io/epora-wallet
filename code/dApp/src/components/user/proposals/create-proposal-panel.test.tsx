import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StashedProposalDraft } from "./stash";

const stash = vi.hoisted(() => ({
  draft: null as StashedProposalDraft | null
}));
const client = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("./stash", () => ({
  readProposalDraft: () => stash.draft,
  clearProposalDraft: vi.fn()
}));
vi.mock("@/lib/proposals/client", () => ({
  createProposal: client.create
}));
vi.mock("@/lib/proposals/serialization", () => ({
  resolveProposalBodyHash: () => "bb".repeat(32)
}));

import { CreateProposalPanel } from "./create-proposal-panel";

function draft(overrides: Partial<StashedProposalDraft> = {}): StashedProposalDraft {
  return {
    walletUnit: `${"aa".repeat(28)}01`,
    walletPolicyId: "aa".repeat(28),
    actionKind: "use",
    authorityPath: "multisig",
    builder: "wallet-spend",
    buildContext: {} as StashedProposalDraft["buildContext"],
    unsignedTxHex: "80",
    summary: { headline: "Send 5 ADA to addr_test1qq", rows: [] },
    ...overrides
  };
}

function renderPanel() {
  return render(<CreateProposalPanel onCreated={() => {}} onCancel={() => {}} />);
}

beforeEach(() => {
  stash.draft = draft();
  client.create.mockReset();
  client.create.mockResolvedValue({ id: "proposal-1" });
});

describe("saving a transaction as an approval request", () => {
  /** "The workspace" is the code's name for the page the reader calls the wallet. */
  it("sends an empty-handed reader to the page that builds one", () => {
    stash.draft = null;
    renderPanel();

    expect(screen.getByText(/Build a transaction on the wallet page/)).toBeInTheDocument();
    expect(screen.queryByText(/workspace/i)).toBeNull();
  });

  /**
   * The subtitle spoke of "authority" and "other participants". The reader is one of the
   * people involved, and what they need to know is who reads this next.
   */
  it("says who will read the request, in their own words", () => {
    renderPanel();

    expect(
      screen.getByText(/The people who have to sign will see this exact transaction/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/authority/i)).toBeNull();
    expect(screen.queryByText(/participants/i)).toBeNull();
  });

  /** The summary block rendered a bare headline with nothing saying what it was. */
  it("labels the summary of the transaction being saved", () => {
    renderPanel();

    expect(screen.getByText("What you are asking for")).toBeInTheDocument();
    expect(screen.getByText("Send 5 ADA to addr_test1qq")).toBeInTheDocument();
  });

  /** "Proposal" is the word this area retired; the card title already names the thing. */
  it("names the button after what the card saves", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: /save request/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save proposal/i })).toBeNull();
  });

  it("announces a save that failed", async () => {
    client.create.mockRejectedValue(new Error("The server refused this request."));
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /save request/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("The server refused this request.")
    );
  });
});
