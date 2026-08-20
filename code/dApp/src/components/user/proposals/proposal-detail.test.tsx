import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

import { ProposalDetail } from "./proposal-detail";

describe("ProposalDetail signing gate", () => {
  beforeEach(() => {
    verify.proposal.mockReset();
    verify.proposal.mockReturnValue(new Promise(() => undefined));
  });

  it("keeps signing disabled until verification completes as valid", async () => {
    render(
      <ProposalDetail
        proposalId={detail.id}
        sessionKeyHash={"dd".repeat(28)}
        onChanged={() => undefined}
        onBack={() => undefined}
      />
    );

    expect(await screen.findByRole("button", { name: /verify & sign/i })).toBeDisabled();
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

    render(
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

    render(
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
});
