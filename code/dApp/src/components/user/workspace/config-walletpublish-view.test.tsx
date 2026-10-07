import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryTestWrapper } from "@/test/query-client";
import { publishCertificateJsonAtom } from "@/components/user/workspace/atoms/forms/publish-form.atoms";
import type { DrepsResponseDto, DrepSummary } from "@/lib/api/dreps";

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

const OTHER_ID = "drep1ygpzpm4q38rfueu2use5te4ylykn4smvs7cxj2ggvktcjkqpxhvf4";
const PICKS: DrepSummary[] = [
  { drepId: DREP_ID, name: "Ada Lovelace", votingPowerLovelace: "12000000", hasScript: false, status: "active" },
  { drepId: OTHER_ID, name: "Grace Hopper", votingPowerLovelace: "5000000", hasScript: false, status: "active" }
];

/** `search` answers `/api/v1/dreps/search` for the typed text; `null` fails it. */
type Search = ((q: string) => DrepSummary[]) | null;

function stubChain({
  registered = true,
  drepId = null as string | null,
  drep = DREP as Drep | null,
  search = ((q: string) => (q ? PICKS.filter((pick) => pick.name?.toLowerCase().includes(q.toLowerCase())) : PICKS)) as Search
} = {}) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith("/api/v1/accounts")) {
      return new Response(JSON.stringify({ account: { stakeAddress: STAKE, registered, poolId: null, drepId } }));
    }
    if (url.startsWith("/api/v1/dreps/search")) {
      const q = new URL(url, "http://x").searchParams.get("q") ?? "";
      return search
        ? new Response(JSON.stringify({ dreps: search(q) }))
        : new Response(JSON.stringify({ error: "The chain data provider is unavailable." }), { status: 502 });
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
const choice = (name: RegExp) => screen.getByRole("radio", { name });

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
    expect(choice(/Always abstain/)).toBeChecked();
    expect(screen.getByText(/Delegates this wallet.s vote/)).toBeInTheDocument();
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
    expect(screen.getByText(/not registered yet/)).toHaveTextContent("2 ADA");
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

    await waitFor(() => expect(screen.getByText(/Could not check/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("moves focus to the status text when a retry succeeds", async () => {
    // Review finding: Retry unmounts on success, which dropped keyboard focus to <body>.
    let fail = true;
    const fetchMock = stubChain();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (fail ? new Response("{}", { status: 502 }) : fetchMock(url))));
    renderView();
    const retry = await screen.findByRole("button", { name: "Retry" });

    fail = false;
    retry.focus();
    fireEvent.click(retry);

    await waitFor(() => expect(document.activeElement).toHaveAttribute("role", "status"));
    expect(document.activeElement).toHaveTextContent(/Current voting delegate/);
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

    expect(screen.getByText(/Could not find this wallet.s staking address/)).toBeInTheDocument();
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

  it("announces a found DRep, which is otherwise silent", async () => {
    stubChain();
    renderView();
    await ready();

    await lookUp(DREP_ID);

    await waitFor(() =>
      expect(screen.getAllByRole("status").some((node) => node.textContent === "Found Ada Lovelace.")).toBe(true)
    );
  });

  it("restores a confirmed DRep when the reader passes over another choice and back", async () => {
    // Review finding: arrow keys select radios as they move, so reading the next hint wiped the DRep.
    stubChain();
    renderView();
    await ready();
    await lookUp(DREP_ID);
    await waitFor(() => expect(screen.getByText("Ada Lovelace")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Delegate to this DRep/ }));

    fireEvent.click(choice(/Always abstain/));
    fireEvent.click(choice(/A DRep/));

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

describe("finding a DRep by name", () => {
  const box = () => screen.getByLabelText("Find your DRep");
  const searched = (fetchMock: ReturnType<typeof stubChain>) =>
    fetchMock.mock.calls.map(([url]) => url).filter((url) => url.startsWith("/api/v1/dreps/search"));

  async function browse() {
    renderView();
    await ready();
    fireEvent.click(choice(/A DRep/));
  }

  it("offers random picks before the reader types, and says they are not a recommendation", async () => {
    const fetchMock = stubChain();
    await browse();

    await waitFor(() => expect(screen.getByRole("button", { name: /Grace Hopper/ })).toBeInTheDocument());
    expect(screen.getByText(/This is not a recommendation/)).toBeInTheDocument();
    expect(searched(fetchMock)).toEqual(["/api/v1/dreps/search?q="]);
  });

  it("searches the typed name and opens a match's card, which still asks before delegating", async () => {
    const fetchMock = stubChain();
    await browse();

    await screen.findByRole("button", { name: /Grace Hopper/ });
    fireEvent.change(box(), { target: { value: "ada" } });
    // The random picks stay up, dimmed, until the matches for "ada" replace them.
    await waitFor(() => expect(screen.queryByRole("button", { name: /Grace Hopper/ })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Ada Lovelace/ }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Delegate to this DRep/ })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/dreps?id=${encodeURIComponent(DREP_ID)}`, expect.anything());
    expect(box()).toHaveValue(DREP_ID);
    expect(context.store.get(publishCertificateJsonAtom)).toBe("{}");
  });

  it("opens the top match when Look up is pressed before the matches arrive", async () => {
    const fetchMock = stubChain();
    await browse();

    fireEvent.change(box(), { target: { value: "grace" } });
    fireEvent.click(screen.getByRole("button", { name: /Look up/ }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(`/api/v1/dreps?id=${encodeURIComponent(OTHER_ID)}`, expect.anything())
    );
    expect(box()).toHaveValue(OTHER_ID);
  });

  it("sends a pasted id to the exact lookup, not the search", async () => {
    const fetchMock = stubChain();
    await browse();
    await waitFor(() => expect(searched(fetchMock)).toHaveLength(1));

    fireEvent.change(box(), { target: { value: `https://explorer.example/drep/${DREP_ID}` } });
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(searched(fetchMock)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Grace Hopper/ })).not.toBeInTheDocument();
  });

  it("says when no DRep matches the name", async () => {
    stubChain();
    await browse();

    fireEvent.change(box(), { target: { value: "nobody" } });

    await waitFor(() => expect(screen.getByText(/No DRep on this network matches/)).toHaveTextContent("nobody"));
  });

  it("says when the list cannot load, and still takes a pasted id", async () => {
    stubChain({ search: null });
    await browse();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/You can still paste a DRep id/));
    fireEvent.change(box(), { target: { value: DREP_ID } });
    fireEvent.click(screen.getByRole("button", { name: /Look up/ }));

    await waitFor(() => expect(screen.getByText("Ada Lovelace")).toBeInTheDocument());
  });

  it("asks for a name or id on an empty Look up, and drops the hint once the reader types", async () => {
    stubChain();
    await browse();

    fireEvent.click(screen.getByRole("button", { name: /Look up/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Type a DRep name, or paste a drep1… id.");

    fireEvent.change(box(), { target: { value: "a" } });
    expect(screen.queryByText("Type a DRep name, or paste a drep1… id.")).not.toBeInTheDocument();
  });

  it("keeps a pasted explorer link whole, so the id inside it is not cut short", async () => {
    // Review finding: a 64-character cap cut an 86-character link to a partial id.
    stubChain();
    await browse();

    expect(box()).not.toHaveAttribute("maxlength");
  });

  it("sends at most 64 characters to the search, which refuses longer text", async () => {
    const fetchMock = stubChain();
    await browse();

    fireEvent.change(box(), { target: { value: "a".repeat(80) } });

    await waitFor(() => expect(searched(fetchMock)).toContain(`/api/v1/dreps/search?q=${"a".repeat(64)}`));
  });

  it.each(["drep1ygqzap", "DRep1Academy"])("searches %s instead of looking it up as an id", async (text) => {
    // Review finding: any `drep1` text went to the exact lookup and failed as an invalid id.
    const fetchMock = stubChain();
    await browse();

    fireEvent.change(box(), { target: { value: text } });

    await waitFor(() => expect(searched(fetchMock)).toContain(`/api/v1/dreps/search?q=${text}`));
    expect(fetchMock.mock.calls.some(([url]) => url.startsWith("/api/v1/dreps?id="))).toBe(false);
  });

  it("retries a failed lookup when the reader opens that DRep from the list", async () => {
    const fetchMock = stubChain();
    const answer = fetchMock.getMockImplementation()!;
    let failLookup = true;
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith("/api/v1/dreps?id=") && failLookup
        ? new Response(JSON.stringify({ error: "down" }), { status: 502 })
        : answer(url)
    );
    await browse();
    fireEvent.change(box(), { target: { value: DREP_ID } });
    fireEvent.click(screen.getByRole("button", { name: /Look up/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not look up this DRep"));
    failLookup = false;

    fireEvent.change(box(), { target: { value: "ada" } });
    await waitFor(() => expect(screen.queryByRole("button", { name: /Grace Hopper/ })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Ada Lovelace/ }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Delegate to this DRep/ })).toBeInTheDocument());
  });

  it("puts focus back in the box when a row closes the list", async () => {
    stubChain();
    await browse();

    const row = await screen.findByRole("button", { name: /Grace Hopper/ });
    row.focus();
    fireEvent.click(row);

    expect(document.activeElement).toBe(box());
  });

  it("does not open a DRep after the reader leaves a pending Look up", async () => {
    const fetchMock = stubChain();
    const answer = fetchMock.getMockImplementation()!;
    let release = () => undefined as void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("?q=grace")) await held;
      return answer(url);
    });
    await browse();

    fireEvent.change(box(), { target: { value: "grace" } });
    await waitFor(() => expect(searched(fetchMock)).toContain("/api/v1/dreps/search?q=grace"));
    fireEvent.click(screen.getByRole("button", { name: /Look up/ }));
    fireEvent.click(choice(/Always abstain/));
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(fetchMock.mock.calls.some(([url]) => url.startsWith("/api/v1/dreps?id="))).toBe(false);
  });

  it("does not open a DRep when a draft restore leaves the DRep choice during a pending Look up", async () => {
    const fetchMock = stubChain();
    const answer = fetchMock.getMockImplementation()!;
    let release = () => undefined as void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("?q=grace")) await held;
      return answer(url);
    });
    await browse();

    fireEvent.change(box(), { target: { value: "grace" } });
    await waitFor(() => expect(searched(fetchMock)).toContain("/api/v1/dreps/search?q=grace"));
    fireEvent.click(screen.getByRole("button", { name: /Look up/ }));
    act(() => {
      context.store.set(
        publishCertificateJsonAtom,
        JSON.stringify({ type: "VoteDelegation", stakeKeyAddress: STAKE, drep: { alwaysAbstain: null } })
      );
    });
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(fetchMock.mock.calls.some(([url]) => url.startsWith("/api/v1/dreps?id="))).toBe(false);
  });

  it("searches a long text cut through an emoji without failing", async () => {
    const fetchMock = stubChain();
    await browse();

    fireEvent.change(box(), { target: { value: `${"a".repeat(63)}😀 more` } });

    await waitFor(() => expect(searched(fetchMock)).toContain(`/api/v1/dreps/search?q=${"a".repeat(63)}`));
    expect(screen.queryByText(/Couldn't load the DRep list/)).not.toBeInTheDocument();
  });

  it("looks up a pasted id while another DRep is still loading", async () => {
    // Review finding: Look up was ignored while any lookup ran, so the first card showed under the second id.
    const fetchMock = stubChain();
    const answer = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string) =>
      url === `/api/v1/dreps?id=${encodeURIComponent(DREP_ID)}` ? new Promise<Response>(() => undefined) : answer(url)
    );
    await browse();
    fireEvent.click(await screen.findByRole("button", { name: /Ada Lovelace/ }));

    fireEvent.change(box(), { target: { value: OTHER_ID } });
    fireEvent.click(screen.getByRole("button", { name: /Look up/ }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(`/api/v1/dreps?id=${encodeURIComponent(OTHER_ID)}`, expect.anything())
    );
  });

  it("does not open either of two DReps that publish the same name", async () => {
    // Review finding: a copycat with a lower id took Enter for a well-known name.
    const twin: DrepSummary = { ...PICKS[1], name: "ada lovelace" };
    const fetchMock = stubChain({ search: (q) => (q ? [PICKS[0], twin] : PICKS) });
    await browse();

    fireEvent.change(box(), { target: { value: "ada" } });
    fireEvent.click(screen.getByRole("button", { name: /Look up/ }));
    await waitFor(() => expect(searched(fetchMock)).toContain("/api/v1/dreps/search?q=ada"));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(fetchMock.mock.calls.some(([url]) => url.startsWith("/api/v1/dreps?id="))).toBe(false);
    expect(screen.getAllByRole("button", { name: /ada lovelace/i })).toHaveLength(2);
  });

  it("does not show a failed id's error under a name search", async () => {
    stubChain({ drep: null });
    await browse();
    fireEvent.change(box(), { target: { value: DREP_ID } });
    fireEvent.click(screen.getByRole("button", { name: /Look up/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No DRep with that id"));

    fireEvent.change(box(), { target: { value: "grace" } });

    expect(screen.queryByText(/No DRep with that id/)).not.toBeInTheDocument();
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
    expect(screen.queryByText(/Delegates this wallet.s vote/)).not.toBeInTheDocument();
  });

  it("names the delegate the certificate will send", async () => {
    stubChain();
    renderView();
    await ready();

    fireEvent.click(choice(/Always no confidence/));

    expect(screen.getByText(/Delegates this wallet.s vote to Always no confidence/)).toBeInTheDocument();
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
    expect(choice(/A DRep/)).toBeChecked();
  });
});

describe("the current delegate", () => {
  it("says the address is on another network instead of offering a retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "bad" }), { status: 400 })));
    renderView();

    await waitFor(() => expect(screen.getByText(/on a different Cardano network/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("names the delegate the chain reports", async () => {
    stubChain({ drepId: DREP_ID });
    renderView();

    await waitFor(() => expect(screen.getByText(/^Current voting delegate:/)).toHaveTextContent("drep1y"));
  });

  it("says when there is none", async () => {
    stubChain();
    renderView();

    await waitFor(() => expect(screen.getByText(/^Current voting delegate:/)).toHaveTextContent("Current voting delegate: none."));
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

    expect(screen.getByLabelText("Find your DRep")).toHaveAccessibleDescription(expect.stringContaining(MESSAGE));
    expect(screen.getByLabelText("Find your DRep")).toHaveAttribute("aria-invalid", "true");
  });

  it("has no raw certificate box", () => {
    stubChain();
    renderView();

    expect(screen.queryByRole("textbox", { name: /Certificate/ })).not.toBeInTheDocument();
  });
});
