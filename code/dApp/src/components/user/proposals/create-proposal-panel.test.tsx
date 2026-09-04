import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StashedProposalDraft } from "./stash";

const stash = vi.hoisted(() => ({
  draft: null as StashedProposalDraft | null
}));
const client = vi.hoisted(() => ({ create: vi.fn() }));
const builder = vi.hoisted(() => ({
  build: vi.fn(),
  wallet: {} as object | null,
  keyHash: null as string | null
}));

vi.mock("./stash", () => ({
  readProposalDraft: () => stash.draft,
  clearProposalDraft: vi.fn()
}));
vi.mock("@/lib/proposals/client", () => ({
  createProposal: client.create,
  getProposalErrorMessage: (_error: unknown, fallback: string) => fallback
}));
vi.mock("@/lib/proposals/serialization", () => ({
  resolveProposalBodyHash: () => "bb".repeat(32)
}));
vi.mock("@/lib/proposals/rebuild", () => ({ buildProposalTx: builder.build }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("wallet=unit-1")
}));
vi.mock("@/providers/wallet-provider", () => ({
  useWalletContext: () => ({ activeWallet: builder.wallet, activePaymentKeyHash: builder.keyHash })
}));

import { createDefaultStateForm, type UserFormState } from "@/lib/contracts/state-form";
import type { CreateProposalRequest, ProposalBuildContext } from "@/lib/proposals/types";
import { CreateProposalPanel } from "./create-proposal-panel";

const PROPOSER = "aa".repeat(28);
const OTHER = "bb".repeat(28);

function user(id: string, wallet: string, power: string): UserFormState {
  return {
    id,
    wallets: [wallet],
    perDayAllowance: [],
    remainingAllowance: [],
    nextAllowanceReset: "",
    canRenewProofOfLife: false,
    multiSigPowerMode: "some",
    multiSigPower: power,
    isAdmin: false,
    preset: "custom"
  };
}

// A multisig draft whose proposer holds 2 of the 3 required power on their own.
function multisigDraft(): StashedProposalDraft {
  const stateForm = createDefaultStateForm();
  stateForm.multiSigThresholdMode = "some";
  stateForm.multiSigThreshold = "3";
  stateForm.users = [user("p", PROPOSER, "2"), user("o", OTHER, "2")];
  return draft({
    builder: "stt-spend",
    buildContext: {
      builder: "stt-spend",
      mode: "use",
      config: {},
      input: { sttInputTxHash: "11".repeat(32) }
    } as unknown as ProposalBuildContext,
    proposerKeyHash: PROPOSER,
    stateForm
  });
}

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
  builder.build.mockReset();
  builder.build.mockResolvedValue({ txHex: "85" });
  builder.wallet = {};
  builder.keyHash = PROPOSER.toUpperCase();
});

describe("saving a transaction as an approval request", () => {
  /** "The workspace" is the code's name for the page the reader calls the wallet. */
  it("sends an empty-handed reader to the page that builds one", () => {
    stash.draft = null;
    renderPanel();

    expect(screen.getByText(/Build a transaction on the wallet page/)).toBeInTheDocument();
    expect(screen.queryByText(/workspace/i)).toBeNull();
  });

  /** `?create=1` with no stash was a dead end: one sentence and a button back to the list. */
  it("links the empty-handed reader to the wallet that was open", () => {
    stash.draft = null;
    renderPanel();

    expect(
      screen.getByRole("link", { name: "Go back to the wallet to build a transaction first." })
    ).toHaveAttribute("href", "/user?wallet=unit-1");
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
      expect(screen.getByRole("alert")).toHaveTextContent("Could not save the approval request.")
    );
  });
});

describe("choosing who signs", () => {
  it("does not show a provider's internal rebuild error", async () => {
    stash.draft = multisigDraft();
    builder.build.mockRejectedValue(new Error("provider endpoint /api/v0/key failed"));
    renderPanel();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /save request/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Could not save the approval request.")
    );
    expect(client.create).not.toHaveBeenCalled();
  });

  it("blocks saving until the listed signers can reach the threshold", () => {
    stash.draft = multisigDraft();
    renderPanel();

    const save = screen.getByRole("button", { name: /save request/i });
    expect(save).toBeDisabled();
    expect(screen.getByText(/2 of 3 approval power/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox"));

    expect(screen.getByText(/4 of 3 approval power/)).toBeInTheDocument();
    expect(save).toBeEnabled();
  });

  it("rebuilds the transaction with the chosen co-signers listed before saving", async () => {
    // The stashed transaction lists the proposer alone, and the validator only
    // counts listed signers, so the co-signers have to be in the body itself.
    stash.draft = multisigDraft();
    renderPanel();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /save request/i }));

    await waitFor(() => expect(client.create).toHaveBeenCalledTimes(1));
    expect(builder.build).toHaveBeenCalledWith(
      builder.wallet,
      expect.objectContaining({
        input: { sttInputTxHash: "11".repeat(32), requiredSignerKeyHashes: [OTHER] }
      })
    );
    const body = client.create.mock.calls[0]![0] as CreateProposalRequest;
    expect(body.unsignedTxHex).toBe("85");
    expect(body.buildContext.input).toEqual({
      sttInputTxHash: "11".repeat(32),
      requiredSignerKeyHashes: [OTHER]
    });
  });

  it("saves the stashed transaction as it is when nobody else is listed", async () => {
    const own = multisigDraft();
    own.stateForm!.multiSigThreshold = "2";
    stash.draft = own;
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /save request/i }));

    await waitFor(() => expect(client.create).toHaveBeenCalledTimes(1));
    expect(builder.build).not.toHaveBeenCalled();
    expect(client.create).toHaveBeenCalledWith(expect.objectContaining({ unsignedTxHex: "80" }));
  });

  it("refuses to rebuild under a wallet other than the one that built the draft", async () => {
    // The set was checked against the proposer's power, and the builder lists the
    // connected wallet's key; a different wallet would save an unrelated set.
    builder.keyHash = OTHER;
    stash.draft = multisigDraft();
    renderPanel();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /save request/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Connect the wallet that built this request/)
    );
    expect(builder.build).not.toHaveBeenCalled();
    expect(client.create).not.toHaveBeenCalled();
  });

  it("asks for the wallet when co-signers are chosen but no wallet is connected", async () => {
    builder.wallet = null;
    stash.draft = multisigDraft();
    renderPanel();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /save request/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Connect the wallet that built this request/)
    );
    expect(client.create).not.toHaveBeenCalled();
  });
});
