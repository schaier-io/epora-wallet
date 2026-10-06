import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryTestWrapper } from "@/test/query-client";
import { publishCertificateJsonAtom } from "@/components/user/workspace/atoms/forms/publish-form.atoms";
import type { DrepsResponseDto } from "@/lib/api/dreps";

const STAKE = "stake_test17rphkx6acpnf78fuvxn0mkew3l0fd058hzquvz7w36x4gtcljw6kf";
const DREP_ID = "drep1ygqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq7vlc9n";
const DEPOSIT = 2_000_000;

const holder = vi.hoisted(() => ({
  rewardAddress: null as string | null,
  fieldErrors: {} as Record<string, string[]>
}));

vi.mock(
  "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms",
  async (importOriginal) => {
    const { atom } = await import("jotai");
    return {
      ...(await importOriginal<Record<string, unknown>>()),
      walletRewardAddressAtom: atom(() => holder.rewardAddress)
    };
  }
);

vi.mock("@/components/user/workspace/workspace-actions-context", () => ({
  useWorkspaceActions: () => ({ activeFieldErrors: holder.fieldErrors })
}));

vi.mock("@/lib/query/chain", async (importOriginal) => {
  const { queryOptions } = await import("@tanstack/react-query");
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    protocolParametersQueryOptions: () =>
      queryOptions({ queryKey: ["test", "protocol"], queryFn: async () => ({ keyDeposit: DEPOSIT }) })
  };
});

const { WalletPublishConfigView } = await import("@/components/user/workspace/config-walletpublish-view");

type Drep = DrepsResponseDto["drep"];
const DREP: Drep = { drepId: DREP_ID, name: "Ada Lovelace", votingPowerLovelace: "12000000", hasScript: false, status: "active" };

let context: ReturnType<typeof createQueryTestWrapper>;

function stubChain({ registered = true, drepId = null as string | null, drep = DREP as Drep | null } = {}) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith("/api/v1/accounts")) {
      return new Response(JSON.stringify({ account: { stakeAddress: STAKE, registered, poolId: null, drepId } }));
    }
    if (url.startsWith("/api/v1/dreps") && drep) return new Response(JSON.stringify({ drep }));
    return new Response(JSON.stringify({ error: "DRep not found on this network." }), { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderView(saved = "{}") {
  context.store.set(publishCertificateJsonAtom, saved);
  return render(<WalletPublishConfigView />, { wrapper: context.wrapper });
}

const written = () => JSON.parse(context.store.get(publishCertificateJsonAtom)) as unknown;
const choice = (name: RegExp) => screen.getByRole("button", { name });

async function ready() {
  await waitFor(() => expect(choice(/Always abstain/)).toBeEnabled(), { timeout: 4000 });
}

beforeEach(() => {
  context = createQueryTestWrapper();
  holder.rewardAddress = STAKE;
  holder.fieldErrors = {};
});
afterEach(() => {
  context.queryClient.clear();
  vi.unstubAllGlobals();
});

describe("predefined choices", () => {
  it("delegates a registered address to always abstain", async () => {
    stubChain();
    renderView();
    await ready();

    fireEvent.click(choice(/Always abstain/));

    expect(written()).toEqual({ type: "VoteDelegation", stakeKeyAddress: STAKE, drep: { alwaysAbstain: null } });
    expect(choice(/Always abstain/)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Sends a voting delegation/)).toBeInTheDocument();
  });

  it("registers an unregistered address in the same certificate and names the deposit", async () => {
    // Without registration the ledger rejects a bare VoteDelegation.
    stubChain({ registered: false });
    renderView();
    await ready();

    fireEvent.click(choice(/Always no confidence/));

    expect(written()).toEqual({
      type: "VoteRegistrationAndDelegation",
      stakeKeyAddress: STAKE,
      drep: { alwaysNoConfidence: null },
      coin: DEPOSIT
    });
    expect(screen.getByText(/not registered yet/)).toHaveTextContent("2 ₳");
    expect(screen.getByText(/Registers the staking address/)).toBeInTheDocument();
  });

  it("writes nothing until the address's registration is known", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    renderView();

    expect(screen.getByText(/Checking this wallet's staking address/)).toBeInTheDocument();
    expect(choice(/Always abstain/)).toBeDisabled();
  });

  it("offers a retry when the registration check fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 502 })));
    renderView();

    await waitFor(() => expect(screen.getByText(/Couldn't check/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("re-types a saved choice when the address turns out to be registered", async () => {
    stubChain({ registered: true });
    renderView(
      JSON.stringify({ type: "VoteRegistrationAndDelegation", stakeKeyAddress: STAKE, drep: { alwaysAbstain: null }, coin: DEPOSIT })
    );

    await waitFor(() =>
      expect(written()).toEqual({ type: "VoteDelegation", stakeKeyAddress: STAKE, drep: { alwaysAbstain: null } })
    );
  });

  it("says why there is nothing to choose before the wallet opens", () => {
    holder.rewardAddress = null;
    stubChain();
    renderView();

    expect(screen.getByText(/staking address could not be worked out yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Always abstain/ })).not.toBeInTheDocument();
  });
});

describe("choosing a DRep", () => {
  async function lookUp(pasted: string) {
    fireEvent.click(choice(/A DRep/));
    fireEvent.change(screen.getByLabelText("Find your DRep"), { target: { value: pasted } });
    fireEvent.click(screen.getByRole("button", { name: /Look up/ }));
  }

  it("looks up the id inside a pasted link and delegates on an explicit choice", async () => {
    const fetchMock = stubChain();
    renderView();
    await ready();

    await lookUp(`https://explorer.example/drep/${DREP_ID}`);
    await waitFor(() => expect(screen.getByText("Ada Lovelace")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/dreps?id=${encodeURIComponent(DREP_ID)}`, expect.anything());
    // Browsing writes nothing; the reader confirms the DRep first.
    expect(context.store.get(publishCertificateJsonAtom)).toBe("{}");

    fireEvent.click(screen.getByRole("button", { name: /Delegate to this DRep/ }));

    expect(written()).toEqual({ type: "VoteDelegation", stakeKeyAddress: STAKE, drep: { dRepId: DREP_ID } });
  });

  it("keeps the pressed button in place, so focus is not lost", async () => {
    // Review finding: keying the form on the saved DRep remounted it on the reader's own
    // click, dropping focus to <body> and swapping the pasted link for the bare id.
    stubChain();
    renderView();
    await ready();
    const link = `https://explorer.example/drep/${DREP_ID}`;
    await lookUp(link);
    await waitFor(() => expect(screen.getByText("Ada Lovelace")).toBeInTheDocument());
    const button = screen.getByRole("button", { name: /Delegate to this DRep/ });

    fireEvent.click(button);

    expect(button.isConnected).toBe(true);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Find your DRep")).toHaveValue(link);
  });

  it("does not delegate to a retired DRep", async () => {
    stubChain({ drep: { ...DREP, status: "retired" } });
    renderView();
    await ready();

    await lookUp(DREP_ID);

    await waitFor(() => expect(screen.getByText(/has retired/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Delegate to this DRep/ })).toBeDisabled();
  });

  it("says when no DRep has that id", async () => {
    stubChain({ drep: null });
    renderView();
    await ready();

    await lookUp(DREP_ID);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No DRep with that id"));
  });

  it("re-shows the saved DRep when the form opens again", async () => {
    stubChain();
    renderView(JSON.stringify({ type: "VoteDelegation", stakeKeyAddress: STAKE, drep: { dRepId: DREP_ID } }));

    await waitFor(() => expect(screen.getByText("Ada Lovelace")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Delegate to this DRep/ })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("what Build sends", () => {
  it("drops a saved predefined choice once the reader switches to a DRep", async () => {
    // Review finding: "A DRep" showed as picked while Build still sent Always abstain.
    stubChain();
    renderView(JSON.stringify({ type: "VoteDelegation", stakeKeyAddress: STAKE, drep: { alwaysAbstain: null } }));
    await ready();

    fireEvent.click(choice(/A DRep/));

    expect(context.store.get(publishCertificateJsonAtom)).toBe("{}");
    expect(screen.queryByText(/Sends a voting delegation/)).not.toBeInTheDocument();
  });

  it("names the delegate the certificate will send", async () => {
    stubChain();
    renderView();
    await ready();

    fireEvent.click(choice(/Always no confidence/));

    expect(screen.getByText(/Sends a voting delegation to Always no confidence/)).toBeInTheDocument();
  });

  it("shows a DRep saved after the form opened", async () => {
    // Review finding: the lookup state was seeded once, so a draft restored later showed no card.
    stubChain();
    renderView();
    await ready();

    act(() => {
      context.store.set(
        publishCertificateJsonAtom,
        JSON.stringify({ type: "VoteDelegation", stakeKeyAddress: STAKE, drep: { dRepId: DREP_ID } })
      );
    });

    await waitFor(() => expect(screen.getByText("Ada Lovelace")).toBeInTheDocument());
    expect(choice(/A DRep/)).toHaveAttribute("aria-pressed", "true");
  });
});

describe("the current delegate", () => {
  it("says the address is on another network instead of offering a retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "bad" }), { status: 400 })));
    renderView();

    await waitFor(() => expect(screen.getByText(/on another network/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("names the delegate the chain reports", async () => {
    stubChain({ drepId: DREP_ID });
    renderView();

    await waitFor(() => expect(screen.getByText(/^Now:/)).toHaveTextContent("drep1y"));
  });

  it("says when there is none", async () => {
    stubChain();
    renderView();

    await waitFor(() => expect(screen.getByText(/^Now:/)).toHaveTextContent("no voting delegate"));
  });
});

describe("a rejected form", () => {
  const MESSAGE = "Choose a voting delegate.";

  it("reads the reason out with the choices", async () => {
    stubChain();
    holder.fieldErrors = { "Certificate JSON": [MESSAGE] };
    renderView();

    expect(screen.getByRole("group", { name: "Delegate to" })).toHaveAccessibleDescription(MESSAGE);
  });

  it("moves the reason to the DRep box while the reader is looking one up", async () => {
    stubChain();
    holder.fieldErrors = { Publish: [MESSAGE] };
    renderView();
    await ready();

    fireEvent.click(choice(/A DRep/));

    expect(screen.getByLabelText("Find your DRep")).toHaveAccessibleDescription(MESSAGE);
    expect(screen.getByLabelText("Find your DRep")).toHaveAttribute("aria-invalid", "true");
  });

  it("has no raw certificate box", () => {
    stubChain();
    renderView();

    expect(screen.queryByRole("textbox", { name: /Certificate/ })).not.toBeInTheDocument();
  });
});
