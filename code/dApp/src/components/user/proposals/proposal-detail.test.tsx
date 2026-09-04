import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProposalDetailDto } from "@/lib/proposals/types";

const fixtures = vi.hoisted(() => ({ detail: {
  id: "proposal-1",
  walletUnit: `${"aa".repeat(28)}01`,
  walletPolicyId: "aa".repeat(28),
  title: "Review me",
  description: null,
  actionKind: "use",
  authorityPath: "multisig",
  status: "OPEN",
  txBodyHash: "bb".repeat(32),
  submittedTxHash: null,
  createdByKeyHash: "cc".repeat(28),
  createdAt: "2026-07-31T00:00:00.000Z",
  updatedAt: "2026-07-31T00:00:00.000Z",
  signatureCount: 0,
  signerKeyHashes: [],
  unsignedTxHex: "80",
  buildContextJson: null,
  summaryJson: null,
  signatures: []
} }));
const verify = vi.hoisted(() => ({ proposal: vi.fn() }));

const detail = fixtures.detail as ProposalDetailDto;

vi.mock("@/lib/proposals/client", () => ({
  cancelProposal: vi.fn(),
  fetchProposal: vi.fn().mockResolvedValue(fixtures.detail),
  markProposalSubmitted: vi.fn(),
  parseProposalBuildContext: vi.fn().mockReturnValue(null),
  parseProposalSummary: vi.fn().mockReturnValue(null),
  rebuildProposal: vi.fn(),
  signProposal: vi.fn()
}));
vi.mock("@/lib/proposals/verify", () => ({
  verifyProposal: verify.proposal
}));
vi.mock("@/lib/proposals/assemble", () => ({
  assembleSignedTx: vi.fn(),
  normalizeWitnessSetHex: vi.fn()
}));
vi.mock("@/lib/proposals/rebuild", () => ({
  RebuildUnsupportedError: class extends Error {},
  isAutoRebuildable: vi.fn().mockReturnValue(false),
  rebuildProposalTx: vi.fn()
}));
vi.mock("@/providers/wallet-provider", () => ({
  useWalletContext: () => ({ activeWallet: { signTx: vi.fn() }, isDemoWallet: false })
}));

import { ToastProvider } from "@/providers/toast-provider";
import {
  fetchProposal,
  parseProposalBuildContext,
  parseProposalSummary
} from "@/lib/proposals/client";
import { isAutoRebuildable } from "@/lib/proposals/rebuild";
import { ProposalDetail } from "./proposal-detail";

// The app mounts `ToastProvider` at the root layout, and this component now raises a toast
// when the clipboard refuses the share link, so the provider is part of its contract.
function renderDetail(ui: ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

describe("ProposalDetail signing gate", () => {
  beforeEach(() => {
    verify.proposal.mockReset();
    verify.proposal.mockReturnValue(new Promise(() => undefined));
  });

  /** A grey Sign button used to sit here. Now only the note says what is happening. */
  it("offers no Sign button until verification completes as valid", async () => {
    renderDetail(
      <ProposalDetail
        proposalId={detail.id}
        sessionKeyHash={"dd".repeat(28)}
        onChanged={() => undefined}
        onBack={() => undefined}
      />
    );

    expect(
      await screen.findByText("Checking this request against the blockchain.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign this request/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /submit transaction/i })).toBeNull();
  });

  it("shows complete output addresses and every native-asset amount", async () => {
    const address = `addr_test1${"q".repeat(70)}`;
    const unit = `${"ab".repeat(28)}01`;
    verify.proposal.mockResolvedValue({
      validity: "valid",
      reasons: [],
      bodyHashMatches: true,
      effect: {
        inputs: [{ txHash: "11".repeat(32), outputIndex: 0, live: true, isSttState: true }],
        outputs: [
          {
            address,
            lovelace: "2000000",
            assets: [{ unit, quantity: "42" }],
            hasInlineDatum: false
          }
        ],
        feeLovelace: "200000"
      },
      signers: {
        authorityPath: "multisig",
        requiredSigners: [],
        signedKeyHashes: [],
        satisfiedPower: 0,
        threshold: 1,
        satisfied: false
      }
    });

    renderDetail(
      <ProposalDetail
        proposalId={detail.id}
        sessionKeyHash={"dd".repeat(28)}
        onChanged={() => undefined}
        onBack={() => undefined}
      />
    );

    expect(await screen.findByText(address)).toBeInTheDocument();
    expect(screen.getByText(`${unit}: 42`)).toBeInTheDocument();
  });
});

describe("on-chain links", () => {
  const submittedHash = "d40324d2051c06dfa48fe5a3621fbc34ea443366fa95177e66d8fe221f1fa217";

  beforeEach(() => {
    verify.proposal.mockReset();
    verify.proposal.mockReturnValue(new Promise(() => undefined));
  });

  afterEach(() => {
    detail.status = "OPEN";
    detail.submittedTxHash = null;
  });

  it("links the submitted transaction to Cardanoscan on every visit, not only right after sending", async () => {
    detail.status = "SUBMITTED";
    detail.submittedTxHash = submittedHash;

    renderDetail(
      <ProposalDetail
        proposalId={detail.id}
        sessionKeyHash={"dd".repeat(28)}
        onChanged={() => undefined}
        onBack={() => undefined}
      />
    );

    const link = await screen.findByTitle("Open transaction on Cardanoscan");
    expect(link).toHaveAttribute(
      "href",
      `https://preprod.cardanoscan.io/transaction/${submittedHash}`
    );
    expect(link).toHaveTextContent("d40324d2051c…1f1fa217");
  });

  /** A sent request's inputs were consumed by its own success; the liveness pass
   * read exactly that as "already spent" and branded the request Invalid. */
  it("does not run the spent-input check on a request that already went through", async () => {
    detail.status = "SUBMITTED";
    detail.submittedTxHash = submittedHash;

    renderDetail(
      <ProposalDetail
        proposalId={detail.id}
        sessionKeyHash={"dd".repeat(28)}
        onChanged={() => undefined}
        onBack={() => undefined}
      />
    );

    await screen.findByTitle("Open transaction on Cardanoscan");
    expect(verify.proposal).not.toHaveBeenCalled();
    expect(screen.queryByText("Invalid")).toBeNull();
    expect(screen.queryByText(/already been spent/)).toBeNull();
  });

  it("links every consumed input to the transaction that holds it", async () => {
    verify.proposal.mockResolvedValue({
      validity: "valid",
      reasons: [],
      bodyHashMatches: true,
      effect: {
        inputs: [{ txHash: "11".repeat(32), outputIndex: 3, live: true, isSttState: false }],
        outputs: [],
        feeLovelace: "200000"
      },
      signers: {
        authorityPath: "multisig",
        requiredSigners: [],
        signedKeyHashes: [],
        satisfiedPower: 0,
        threshold: 1,
        satisfied: false
      }
    });

    renderDetail(
      <ProposalDetail
        proposalId={detail.id}
        sessionKeyHash={"dd".repeat(28)}
        onChanged={() => undefined}
        onBack={() => undefined}
      />
    );

    const link = await screen.findByTitle("Open transaction on Cardanoscan");
    expect(link).toHaveAttribute(
      "href",
      `https://preprod.cardanoscan.io/transaction/${"11".repeat(32)}`
    );
    expect(link).toHaveTextContent("11111111…1111#3");
  });
});

describe("telling another signer about a request", () => {
  beforeEach(() => {
    verify.proposal.mockReset();
    verify.proposal.mockReturnValue(new Promise(() => undefined));
  });

  it("copies a link that carries both the wallet and the request", async () => {
    const written: string[] = [];
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (value: string) => {
          written.push(value);
          return Promise.resolve();
        }
      }
    });

    renderDetail(
      <ProposalDetail
        proposalId={detail.id}
        sessionKeyHash={"dd".repeat(28)}
        onChanged={() => undefined}
        onBack={() => undefined}
      />
    );

    const copy = await screen.findByRole("button", { name: /copy link/i });
    fireEvent.click(copy);

    await waitFor(() => expect(written).toHaveLength(1));
    expect(written[0]).toBe(
      `${window.location.origin}/user/proposals?wallet=${detail.walletUnit}&proposal=${detail.id}`
    );
    expect(await screen.findByRole("button", { name: /link copied/i })).toBeInTheDocument();
  });

  it("warns instead of going quiet when the clipboard refuses the link", async () => {
    // Both paths fail, which is what a plain-HTTP origin looks like. The handler used to call
    // `setLinkCopied(ok)`, writing `false` over `false`, so the button simply never changed.
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: undefined
    });
    document.execCommand = () => false;

    renderDetail(
      <ProposalDetail
        proposalId={detail.id}
        sessionKeyHash={"dd".repeat(28)}
        onChanged={() => undefined}
        onBack={() => undefined}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: /copy link/i }));

    expect(await screen.findByText("Nothing was copied")).toBeInTheDocument();
    expect(
      screen.getByText(/select the text and press Ctrl\+C, or Cmd\+C on a Mac\./i)
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /link copied/i })).not.toBeInTheDocument();
  });
});

/**
 * Sign and Submit are each gated on three conditions, and a disabled button is not
 * focusable. Everything below is the one line that says which condition is holding.
 */
describe("what the buttons are waiting for", () => {
  function verification(overrides: Record<string, unknown> = {}) {
    return {
      validity: "valid",
      reasons: [],
      bodyHashMatches: true,
      effect: { inputs: [], outputs: [], feeLovelace: "200000" },
      signers: {
        authorityPath: "multisig",
        requiredSigners: [],
        signedKeyHashes: [],
        satisfiedPower: 0,
        threshold: 1,
        satisfied: false
      },
      ...overrides
    };
  }

  function renderAs(sessionKeyHash = "dd".repeat(28)) {
    return renderDetail(
      <ProposalDetail
        proposalId={detail.id}
        sessionKeyHash={sessionKeyHash}
        onChanged={() => undefined}
        onBack={() => undefined}
      />
    );
  }

  beforeEach(() => {
    verify.proposal.mockReset();
    verify.proposal.mockReturnValue(new Promise(() => undefined));
    vi.mocked(fetchProposal).mockResolvedValue(detail);
    vi.mocked(parseProposalBuildContext).mockReturnValue(null);
    vi.mocked(parseProposalSummary).mockReturnValue(null);
    vi.mocked(isAutoRebuildable).mockReturnValue(false);
  });

  it("says the check is still running", async () => {
    renderAs();
    expect(
      await screen.findByText("Checking this request against the blockchain.")
    ).toBeInTheDocument();
  });

  /**
   * The reset used to be announced only in the message that appeared afterwards, by which
   * point every co-signer's signature was already gone.
   */
  it("warns that a new version clears the signatures before it is pressed", async () => {
    verify.proposal.mockResolvedValue(verification({ validity: "invalid" }));
    vi.mocked(parseProposalBuildContext).mockReturnValue({ builder: "use" } as never);
    vi.mocked(isAutoRebuildable).mockReturnValue(true);
    renderAs(detail.createdByKeyHash);

    expect(await screen.findByText(/clears every signature it already has/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /make a new version/i })).toBeEnabled();
  });

  it("tells a co-signer that only the proposer can make a new version", async () => {
    // The server answers 403 to anyone but the proposer, so the button must not
    // drive a co-signer's wallet through a rebuild first.
    verify.proposal.mockResolvedValue(verification({ validity: "invalid" }));
    vi.mocked(parseProposalBuildContext).mockReturnValue({ builder: "use" } as never);
    vi.mocked(isAutoRebuildable).mockReturnValue(true);
    renderAs();

    expect(await screen.findByText(/only the proposer can make a new version/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /make a new version/i })).toBeNull();
  });

  it("says the request expired rather than blaming moved funds", async () => {
    verify.proposal.mockResolvedValue(verification({ validity: "invalid", expired: true }));
    vi.mocked(parseProposalBuildContext).mockReturnValue({ builder: "use" } as never);
    vi.mocked(isAutoRebuildable).mockReturnValue(true);
    renderAs(detail.createdByKeyHash);

    expect(await screen.findByText(/expired before it was sent/)).toBeInTheDocument();
    expect(screen.queryByText(/funds that have since moved/)).not.toBeInTheDocument();
  });

  it("tells everyone to leave a request alone while it is being sent", async () => {
    // The row stays SUBMITTING when the chain accepted the tx but the record did not
    // finish. The live check then sees spent inputs, and the out-of-date note would
    // send the proposer off to build the same transfer a second time.
    vi.mocked(fetchProposal).mockResolvedValue({ ...detail, status: "SUBMITTING" });
    verify.proposal.mockResolvedValue(verification({ validity: "invalid" }));
    renderAs(detail.createdByKeyHash);

    expect(await screen.findByText(/is being sent to the blockchain/)).toBeInTheDocument();
    expect(screen.queryByText(/build it again from the wallet page/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /make a new version/i })).toBeNull();
  });

  it("says where to go when the request cannot be remade here", async () => {
    verify.proposal.mockResolvedValue(verification({ validity: "invalid" }));
    renderAs();

    expect(
      await screen.findByText(/build it again from the wallet page/)
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /make a new version/i })).toBeNull();
  });

  it("says the request is ready once enough people have signed", async () => {
    verify.proposal.mockResolvedValue(
      verification({
        signers: {
          authorityPath: "multisig",
          requiredSigners: [],
          signedKeyHashes: [],
          satisfiedPower: 1,
          threshold: 1,
          satisfied: true
        }
      })
    );
    renderAs();

    expect(await screen.findByText(/Enough people have signed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit transaction/i })).toBeEnabled();
    // Submit is the one primary action once the threshold is met.
    expect(screen.queryByRole("button", { name: /sign this request/i })).toBeNull();
  });

  it("offers Sign, and only Sign, to a co-signer who has not signed a valid request", async () => {
    verify.proposal.mockResolvedValue(verification());
    renderAs();

    expect(await screen.findByRole("button", { name: /sign this request/i })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /submit transaction/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /make a new version/i })).toBeNull();
  });
});

describe("the words on the approval request detail", () => {
  function renderAs(sessionKeyHash = "dd".repeat(28)) {
    return renderDetail(
      <ProposalDetail
        proposalId={detail.id}
        sessionKeyHash={sessionKeyHash}
        onChanged={() => undefined}
        onBack={() => undefined}
      />
    );
  }

  beforeEach(() => {
    verify.proposal.mockReset();
    verify.proposal.mockResolvedValue({
      validity: "valid",
      reasons: [],
      bodyHashMatches: true,
      effect: { inputs: [], outputs: [], feeLovelace: "200000" },
      signers: null
    });
    vi.mocked(parseProposalBuildContext).mockReturnValue(null);
    vi.mocked(parseProposalSummary).mockReturnValue(null);
    vi.mocked(isAutoRebuildable).mockReturnValue(false);
  });

  /** The note is the one thing on this screen nobody has checked. */
  it("keeps the warning off the same line as the text it warns about", async () => {
    vi.mocked(parseProposalSummary).mockReturnValue({
      headline: "Send 5 ADA to addr_test1qq",
      rows: []
    } as never);
    const { container } = renderAs();

    expect(
      await screen.findByText("Written by whoever made this request. Nobody has checked it.")
    ).toBeInTheDocument();
    expect(screen.getByText("Send 5 ADA to addr_test1qq")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/[—–]/);
  });

  it("labels the decoded transaction in the reader's words", async () => {
    renderAs();

    expect(await screen.findByText("Funds it uses")).toBeInTheDocument();
    expect(screen.getByText("Where the money goes")).toBeInTheDocument();
    expect(screen.queryByText(/decoded from the bytes/)).toBeNull();
    expect(
      screen.getByText("Read from the transaction itself, not from the note above it.")
    ).toBeInTheDocument();
  });

  /**
   * Everywhere else in the app a Cancel button closes something without doing anything.
   * This one withdrew a request other people were waiting to sign.
   */
  it("says what the destructive button destroys", async () => {
    renderAs(detail.createdByKeyHash);

    expect(
      await screen.findByRole("button", { name: /withdraw request/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Cancel$/ })).toBeNull();
  });
});
