import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProposalListItemDto } from "@/lib/proposals/types";

const nav = vi.hoisted(() => ({ params: "" }));
const session = vi.hoisted(() => ({
  value: {
    session: { paymentKeyHash: "cc".repeat(28) },
    loading: false,
    signingIn: false,
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn()
  } as Record<string, unknown>
}));
const list = vi.hoisted(() => ({ proposals: [] as ProposalListItemDto[] }));
const client = vi.hoisted(() => ({ fetch: vi.fn() }));
const verify = vi.hoisted(() => ({ proposal: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.params)
}));
vi.mock("./use-proposal-session", () => ({ useProposalSession: () => session.value }));
vi.mock("./use-proposals", () => ({
  useProposals: () => ({
    proposals: list.proposals,
    loading: false,
    loadingMore: false,
    hasMore: false,
    error: null,
    refresh: vi.fn(),
    loadMore: vi.fn()
  })
}));
vi.mock("@/lib/proposals/client", () => ({ fetchProposal: client.fetch }));
vi.mock("@/lib/proposals/verify", () => ({ verifyProposal: verify.proposal }));
vi.mock("./sign-in-gate", () => ({ SignInGate: () => <p>sign in gate</p> }));
vi.mock("./proposal-detail", () => ({ ProposalDetail: () => <p>detail</p> }));
vi.mock("./create-proposal-panel", () => ({ CreateProposalPanel: () => <p>create</p> }));
vi.mock("./proposal-list", () => ({
  ProposalList: ({ reportById }: { reportById: Record<string, { validity: string }> }) => (
    <pre data-testid="report">{JSON.stringify(reportById)}</pre>
  )
}));

import { ProposalsWorkspace } from "./proposals-workspace";

function openProposal(id: string): ProposalListItemDto {
  return {
    id,
    walletUnit: `${"aa".repeat(28)}01`,
    walletPolicyId: "aa".repeat(28),
    title: `Request ${id}`,
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
    signerKeyHashes: []
  };
}

const report = async () =>
  JSON.parse((await screen.findByTestId("report")).textContent ?? "{}") as Record<
    string,
    { validity: string }
  >;

beforeEach(() => {
  nav.params = "";
  session.value = {
    session: { paymentKeyHash: "cc".repeat(28) },
    loading: false,
    signingIn: false,
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn()
  };
  list.proposals = [];
  client.fetch.mockReset();
  verify.proposal.mockReset();
});

describe("the background validity pass", () => {
  /**
   * Any throw used to be written down as `invalid`, which is a verdict on the request. A
   * dropped connection is not one: it says nothing about whether the transaction can still
   * go through.
   */
  it("does not call a failed lookup a dead request", async () => {
    list.proposals = [openProposal("p1")];
    client.fetch.mockRejectedValue(new Error("network down"));
    render(<ProposalsWorkspace />);

    await waitFor(async () => expect((await report()).p1?.validity).toBe("unknown"));
  });

  /**
   * Only the first 20 open requests are queued. The rest were seeded with nothing at all,
   * and the list's fallback branch is a spinner, so they span for ever.
   */
  it("says the requests it never queued were not checked", async () => {
    list.proposals = Array.from({ length: 21 }, (_, index) => openProposal(`p${index}`));
    client.fetch.mockReturnValue(new Promise(() => undefined));
    render(<ProposalsWorkspace />);

    const seeded = await report();
    expect(seeded.p0?.validity).toBe("checking");
    expect(seeded.p19?.validity).toBe("checking");
    expect(seeded.p20?.validity).toBe("unknown");
  });
});

describe("the proposals shell", () => {
  it("names what it is waiting for while the sign-in check runs", () => {
    session.value = { ...session.value, loading: true };
    render(<ProposalsWorkspace />);

    expect(screen.getByText("Checking your sign-in…")).toBeInTheDocument();
  });

  it("shows the signed-in identity as an identifier, not as prose", () => {
    render(<ProposalsWorkspace />);

    expect(screen.getByText(/^cccccccccc/).className).toContain("font-mono");
  });
});
