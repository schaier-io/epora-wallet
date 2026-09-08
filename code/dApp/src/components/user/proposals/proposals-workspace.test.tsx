import type { ReactNode } from "react";
import type { RenderOptions } from "@testing-library/react";
import { createQueryTestWrapper } from "@/test/query-client";
import { act, render as queryRender, screen, waitFor } from "@testing-library/react";
const render = (callback: ReactNode, options?: RenderOptions) => queryRender(callback, { wrapper: createQueryTestWrapper().wrapper, ...options });
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProposalListItemDto } from "@/lib/proposals/types";

const nav = vi.hoisted(() => ({ params: "" }));
const session = vi.hoisted(() => ({
  value: {
    session: { paymentKeyHash: "cc".repeat(28) },
    activeAddress: "addr_test1qqnuqpkw339ylpxvkmxf56d6vygcjejen3evkm8ahnfksyq070e4uyvacq",
    loading: false,
    signingIn: false,
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn()
  } as Record<string, unknown>
}));
const list = vi.hoisted(() => ({
  proposals: [] as ProposalListItemDto[],
  enabled: null as boolean | null
}));
const client = vi.hoisted(() => ({ fetch: vi.fn() }));
const verify = vi.hoisted(() => ({ proposal: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.params)
}));
vi.mock("./use-proposal-session", () => ({ useProposalSession: () => session.value }));
vi.mock("./use-proposals", () => ({
  useProposals: (enabled: boolean) => {
    list.enabled = enabled;
    return {
      proposals: list.proposals,
      loading: false,
      loadingMore: false,
      hasMore: false,
      error: null,
      refresh: vi.fn(),
      loadMore: vi.fn()
    };
  }
}));
vi.mock("@/lib/proposals/client", () => ({ fetchProposal: client.fetch }));
vi.mock("@/lib/proposals/verify", () => ({
  MAX_BACKGROUND_PROPOSAL_INPUT_LOOKUPS: 8,
  verifyProposal: verify.proposal
}));
vi.mock("./sign-in-gate", () => ({ SignInGate: () => <p>sign in gate</p> }));
vi.mock("./proposal-detail", () => ({ ProposalDetail: () => <p>detail</p> }));
vi.mock("./create-proposal-panel", () => ({ CreateProposalPanel: () => <p>create</p> }));
vi.mock("./proposal-list", () => ({
  ProposalList: ({ reportById }: { reportById: Record<string, { validity: string }> }) => (
    <pre data-testid="report">{JSON.stringify(reportById)}</pre>
  )
}));

import {
  BACKGROUND_PROPOSAL_VERIFICATION_TIMEOUT_MS,
  ProposalsWorkspace
} from "./proposals-workspace";

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
    activeAddress: "addr_test1qqnuqpkw339ylpxvkmxf56d6vygcjejen3evkm8ahnfksyq070e4uyvacq",
    loading: false,
    signingIn: false,
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn()
  };
  list.proposals = [];
  list.enabled = null;
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

  it("verifies a full page serially", async () => {
    list.proposals = Array.from({ length: 20 }, (_, index) => openProposal(`p${index}`));
    client.fetch.mockReturnValue(new Promise(() => undefined));

    render(<ProposalsWorkspace />);

    await waitFor(() => expect(client.fetch).toHaveBeenCalledTimes(1));
    expect(client.fetch).toHaveBeenCalledWith("p0", { signal: expect.any(AbortSignal) as AbortSignal });
  });

  it("uses the background input budget", async () => {
    list.proposals = [openProposal("p0")];
    client.fetch.mockResolvedValue({ id: "p0" });
    verify.proposal.mockResolvedValue({ validity: "valid", signers: null });

    render(<ProposalsWorkspace />);

    await waitFor(() =>
      expect(verify.proposal).toHaveBeenCalledWith(
        { id: "p0" },
        { maxInputLookups: 8, signal: expect.any(AbortSignal) as AbortSignal }
      )
    );
  });

  it("stops the serial queue and clears checking rows after one item stalls", async () => {
    vi.useFakeTimers();
    try {
      list.proposals = [openProposal("p0"), openProposal("p1"), openProposal("p2")];
      client.fetch.mockReturnValue(new Promise(() => undefined));

      render(<ProposalsWorkspace />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BACKGROUND_PROPOSAL_VERIFICATION_TIMEOUT_MS + 1);
      });

      const settled = JSON.parse(screen.getByTestId("report").textContent ?? "{}") as Record<
        string,
        { validity: string }
      >;
      expect(settled.p0?.validity).toBe("unknown");
      expect(settled.p1?.validity).toBe("unknown");
      expect(settled.p2?.validity).toBe("unknown");
      expect(client.fetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("queues the newest proposal list without stacking verification work", async () => {
    let release!: (value: { id: string }) => void;
    const pending = new Promise<{ id: string }>((resolve) => {
      release = resolve;
    });
    list.proposals = [openProposal("p0")];
    client.fetch.mockImplementation((id: string) =>
      id === "p0" ? pending : Promise.resolve({ id })
    );
    verify.proposal.mockResolvedValue({ validity: "valid", signers: null });

    const rendered = render(<ProposalsWorkspace />);
    await waitFor(() => expect(client.fetch).toHaveBeenCalledTimes(1));

    list.proposals = [openProposal("p1")];
    rendered.rerender(<ProposalsWorkspace />);

    await waitFor(async () => expect((await report()).p1?.validity).toBe("unknown"));
    expect(client.fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      release({ id: "p0" });
      await pending;
    });

    await waitFor(() => expect(client.fetch).toHaveBeenCalledTimes(2));
    expect(client.fetch).toHaveBeenLastCalledWith("p1", { signal: expect.any(AbortSignal) as AbortSignal });
    await waitFor(async () => expect((await report()).p1?.validity).toBe("valid"));
  });
});

describe("the proposals shell", () => {
  it("names what it is waiting for while the sign-in check runs", () => {
    session.value = { ...session.value, loading: true };
    render(<ProposalsWorkspace />);

    expect(screen.getByText("Checking your sign-in…")).toBeInTheDocument();
  });

  /**
   * The session cookie survives an account switch inside the extension, and the list is
   * scoped server-side by the SESSION's wallet memberships. Trusting the cookie alone put
   * the previous account's approval requests on screen for whoever connected next.
   */
  it("shows no list at all when the connected wallet is not the signed-in one", () => {
    session.value = { ...session.value, connectedWalletMismatch: true };
    render(<ProposalsWorkspace />);

    expect(screen.getByText("sign in gate")).toBeInTheDocument();
    expect(screen.queryByText(/^cccccccccc/)).toBeNull();
    // Not merely hidden: the fetch for that key's requests never starts.
    expect(list.enabled).toBe(false);
  });

  it("shows the signed-in identity as an identifier, not as prose", () => {
    render(<ProposalsWorkspace />);

    // The wallet address, not the key hash the session is built on: the identifier has to be
    // something a user can recognize in their wallet or paste into an explorer.
    expect(screen.getByText(/^addr_test1/).className).toContain("font-mono");
    expect(screen.queryByText(/^cccccccccc/)).toBeNull();
  });

  it("announces a sign-out failure without hiding the signed-in workspace", () => {
    session.value = {
      ...session.value,
      error: "Could not sign out. Try again."
    };
    render(<ProposalsWorkspace />);

    expect(screen.getByRole("alert")).toHaveTextContent("Could not sign out. Try again.");
    expect(screen.getByRole("heading", { name: "Approval requests" })).toBeInTheDocument();
    expect(screen.queryByText("sign in gate")).not.toBeInTheDocument();
  });
});
