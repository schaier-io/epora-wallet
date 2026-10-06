import type { ReactElement } from "react";
import { createQueryTestWrapper } from "@/test/query-client";
import { queryPolicy } from "@/lib/query/keys";
import { queryRetryDelay } from "@/lib/query/client";
import { poolQueryOptions } from "@/lib/query/pools";
import { fireEvent, render as renderUI, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { PoolFinder, type StakePool } from "@/components/user/pool-finder";

const BASE_POOL: StakePool = {
  poolId: "pool1abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmno",
  ticker: "EPORA",
  name: "Epora Pool",
  homepage: null,
  description: null,
  saturation: 0.42,
  liveStakeLovelace: "1000000000",
  activeStakeLovelace: "1000000000",
  declaredPledgeLovelace: "1000000",
  livePledgeLovelace: "1000000",
  marginPct: 0.02,
  fixedCostLovelace: "340000000",
  blocksMinted: 12,
  retiring: false
};

let context: ReturnType<typeof createQueryTestWrapper>;
const render = (ui: ReactElement) => renderUI(ui, { wrapper: context.wrapper });
afterEach(() => context.queryClient.clear());

beforeEach(() => {
  context = createQueryTestWrapper();
  vi.unstubAllGlobals();
});

type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

/**
 * The finder searches as soon as it mounts (the empty box lists a shortlist), so every
 * stub answers `/api/v1/pools/search` itself and hands only exact lookups to `lookupImpl`.
 * A test that counts `lookupImpl` calls therefore counts lookups, not searches.
 */
function stubFetch(lookupImpl: FetchImpl, searchPools: unknown[] = []) {
  const fetchMock = vi.fn((url: string, init: RequestInit) =>
    url.startsWith("/api/v1/pools/search")
      ? Promise.resolve(new Response(JSON.stringify({ pools: searchPools })))
      : lookupImpl(url, init)
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/**
 * The card only offers the pick button for a pool that is not already picked, so every test
 * that needs it looks one up with nothing picked yet.
 */
async function lookUp(pool: StakePool, onSelect = vi.fn()) {
  stubFetch(vi.fn(async () => new Response(JSON.stringify({ pool }))));
  const result = render(<PoolFinder selectedPool={null} onSelect={onSelect} />);
  fireEvent.change(screen.getByLabelText("Find your pool"), {
    target: { value: pool.poolId }
  });
  fireEvent.click(screen.getByRole("button", { name: /Look up/ }));
  await waitFor(() => expect(screen.getByText(shownTitle(pool))).toBeInTheDocument());
  return { ...result, onSelect };
}

function shownTitle(pool: StakePool): string {
  return pool.ticker ? `[${pool.ticker}]` : "Stake pool";
}

/**
 * `selectedStakePoolAtom` (`workspace/atoms/forms/withdraw-form.atoms.ts:9`) is written
 * only by this component and read only by the screen that renders it, to hand the value
 * straight back. Nothing builds, validates or submits a delegation anywhere in the app.
 */
describe("the pick control tells the truth", () => {
  it("offers to pick a pool, not to delegate to one", async () => {
    await lookUp(BASE_POOL);

    expect(screen.getByRole("button", { name: "Pick this pool" })).toBeInTheDocument();
    expect(screen.queryByText("Delegate to this pool")).not.toBeInTheDocument();
  });

  it("hands the whole pool back when picked", async () => {
    const { onSelect } = await lookUp(BASE_POOL);

    fireEvent.click(screen.getByRole("button", { name: "Pick this pool" }));

    expect(onSelect).toHaveBeenCalledWith(BASE_POOL);
  });

  it("marks an already picked pool without claiming a delegation", () => {
    render(<PoolFinder selectedPool={BASE_POOL} onSelect={vi.fn()} />);

    expect(screen.getByText("Picked")).toBeInTheDocument();
    expect(screen.queryByText("Selected to delegate")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  });
});

describe("a closing pool explains its own disabled button", () => {
  it("says why instead of greying out with no reason", async () => {
    await lookUp({ ...BASE_POOL, retiring: true });

    const button = screen.getByRole("button", { name: "This pool is closing" });
    expect(button).toBeDisabled();
    expect(screen.getByText("Retiring")).toBeInTheDocument();
    expect(screen.queryByText("Pick this pool")).not.toBeInTheDocument();
  });
});

describe("missing figures", () => {
  it("says the figure is unknown rather than printing a dash", () => {
    render(
      <PoolFinder
        selectedPool={{
          ...BASE_POOL,
          saturation: null,
          marginPct: null,
          liveStakeLovelace: null,
          fixedCostLovelace: null
        }}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getAllByText("Unknown")).toHaveLength(4);
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });
});

describe("lookup", () => {
  it("shows the pool the server returns", async () => {
    await lookUp(BASE_POOL);

    expect(screen.getByText("42.0%")).toBeInTheDocument();
    expect(screen.getByText("2.0%")).toBeInTheDocument();
  });

  it("asks for a pool id before it calls the server", () => {
    const fetchMock = vi.fn();
    stubFetch(fetchMock);
    render(<PoolFinder selectedPool={null} onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Look up/ }));

    expect(screen.getByText("Type a ticker, a pool name or a pool id (pool1…).")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("links to pool explorers without repeating the helper text inside the box", () => {
    render(<PoolFinder selectedPool={null} onSelect={vi.fn()} />);

    const input = screen.getByLabelText("Find your pool");
    expect(input).toHaveAttribute("placeholder", "Ticker, name or pool1…");
    expect(screen.getByRole("link", { name: "Cardanoscan" })).toHaveAttribute(
      "href",
      "https://cardanoscan.io/pools"
    );
    expect(screen.getByRole("link", { name: "AdaStat" })).toHaveAttribute(
      "href",
      "https://adastat.net/pools"
    );
    // The links go to mainnet, so a preprod reader is told a mainnet id finds nothing here.
    expect(screen.getByText(/This app runs on preprod, which has only test pools/)).toBeInTheDocument();
  });
});

describe("depth", () => {
  it("sits one rung inside the panel that holds it", () => {
    const { container } = render(<PoolFinder selectedPool={BASE_POOL} onSelect={vi.fn()} />);

    // The staking screen wraps this in a rounded-lg panel, so the card inside it cannot be
    // rounded-xl without reading as the wider of the two.
    expect(container.querySelector(".rounded-md.border")).not.toBeNull();
    expect(container.querySelector(".rounded-xl")).toBeNull();
  });
});

describe("a lookup already running", () => {
  it("ignores a second Enter until the first lookup answers", async () => {
    // The button was disabled while loading, but Enter in the box called lookup anyway.
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    stubFetch(fetchMock);
    render(<PoolFinder selectedPool={null} onSelect={vi.fn()} />);
    const input = screen.getByLabelText("Find your pool");
    fireEvent.change(input, { target: { value: BASE_POOL.poolId } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});

it("reuses a fresh lookup and refreshes it after the chain freshness window", async () => {
  const now = Date.now();
  const date = vi.spyOn(Date, "now").mockReturnValue(now);
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ pool: BASE_POOL })));
  stubFetch(fetchMock);
  render(<PoolFinder selectedPool={null} onSelect={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Find your pool"), { target: { value: BASE_POOL.poolId } });
  fireEvent.click(screen.getByRole("button", { name: /Look up/ }));
  await waitFor(() => expect(screen.getByText(shownTitle(BASE_POOL))).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /Look up/ }));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  date.mockReturnValue(now + queryPolicy.chainStaleMs + 1);
  fireEvent.click(screen.getByRole("button", { name: /Look up/ }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  date.mockRestore();
});

it("retains the selected pool while a failed lookup reports the server error", async () => {
  stubFetch(vi.fn(async () => new Response(JSON.stringify({ error: "Pool not found" }), { status: 404 })));
  render(<PoolFinder selectedPool={BASE_POOL} onSelect={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Find your pool"), { target: { value: "pool1missing" } });
  fireEvent.click(screen.getByRole("button", { name: /Look up/ }));
  // A partial id first waits out the search debounce and its answer, then looks up.
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Pool not found"), { timeout: 3_000 });
  expect(screen.getByText("Picked")).toBeInTheDocument();
});

it("rejects a partial response instead of caching a malformed pool", async () => {
  stubFetch(vi.fn(async () => new Response(JSON.stringify({ pool: { poolId: BASE_POOL.poolId } }))));
  render(<PoolFinder selectedPool={null} onSelect={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Find your pool"), { target: { value: BASE_POOL.poolId } });
  fireEvent.click(screen.getByRole("button", { name: /Look up/ }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Pool lookup failed."));
  expect(screen.queryByRole("button", { name: "Pick this pool" })).not.toBeInTheDocument();
});

it("aborts a lookup when its last observer unmounts", async () => {
  let signal: AbortSignal | undefined;
  stubFetch(vi.fn((_url: string, options: RequestInit) => {
    signal = options.signal ?? undefined;
    return new Promise<Response>(() => {});
  }));
  const view = render(<PoolFinder selectedPool={null} onSelect={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Find your pool"), { target: { value: BASE_POOL.poolId } });
  fireEvent.click(screen.getByRole("button", { name: /Look up/ }));
  await waitFor(() => expect(signal).toBeDefined());
  view.unmount();
  expect(signal?.aborted).toBe(true);
});

it("retains Retry-After when a rate-limited pool response contains HTML", async () => {
  stubFetch(vi.fn(async () => new Response("<html>Rate limited</html>", {
    status: 429, headers: { "Retry-After": "60" }
  })));
  const error: unknown = await context.queryClient.fetchQuery(poolQueryOptions(BASE_POOL.poolId)).catch((caught: unknown) => caught);
  expect(error).toMatchObject({ status: 429, retryAfterMs: 60_000 });
  expect(queryRetryDelay(0, error)).toBe(60_000);
});


it.each([1, 1.05])("explains saturation at or above capacity (%s)", (saturation) => {
  render(<PoolFinder selectedPool={{...BASE_POOL, saturation}} onSelect={vi.fn()} />);
  expect(screen.getByText("At or over capacity")).toBeInTheDocument();
});

describe("search", () => {
  const SUMMARY = {
    poolId: BASE_POOL.poolId,
    ticker: "EPORA",
    name: "Epora Pool",
    saturation: 0.42,
    liveStakeLovelace: "1000000000",
    marginPct: 0.02,
    fixedCostLovelace: "340000000",
    retiring: false
  };
  const lookupOk = () => vi.fn(async () => new Response(JSON.stringify({ pool: BASE_POOL })));
  const searchUrls = (fetchMock: ReturnType<typeof stubFetch>) =>
    fetchMock.mock.calls.map(([url]) => url).filter((url) => url.startsWith("/api/v1/pools/search"));

  it("lists the shortlist under an empty box, and says it is not a recommendation", async () => {
    stubFetch(lookupOk(), [SUMMARY]);
    render(<PoolFinder selectedPool={null} onSelect={vi.fn()} />);

    expect(await screen.findByRole("button", { name: /\[EPORA\]/ })).toBeInTheDocument();
    expect(screen.getByText(/This is not a recommendation/)).toBeInTheDocument();
  });

  it("opens a listed pool's card through the exact lookup, without picking it", async () => {
    const lookup = lookupOk();
    const onSelect = vi.fn();
    stubFetch(lookup, [SUMMARY]);
    render(<PoolFinder selectedPool={null} onSelect={onSelect} />);

    fireEvent.click(await screen.findByRole("button", { name: /\[EPORA\]/ }));

    expect(await screen.findByRole("button", { name: "Pick this pool" })).toBeInTheDocument();
    expect(lookup).toHaveBeenCalledWith(`/api/v1/pools?id=${BASE_POOL.poolId}`, expect.anything());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("searches the typed text and opens the top match on Enter", async () => {
    const fetchMock = stubFetch(lookupOk(), [SUMMARY]);
    render(<PoolFinder selectedPool={null} onSelect={vi.fn()} />);
    const input = screen.getByLabelText("Find your pool");

    fireEvent.change(input, { target: { value: "epo" } });
    await waitFor(() => expect(searchUrls(fetchMock)).toContain("/api/v1/pools/search?q=epo"));
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByRole("button", { name: "Pick this pool" })).toBeInTheDocument();
  });

  it("waits for a pause in typing instead of searching every keystroke", async () => {
    const fetchMock = stubFetch(lookupOk(), [SUMMARY]);
    render(<PoolFinder selectedPool={null} onSelect={vi.fn()} />);
    const input = screen.getByLabelText("Find your pool");

    // Keystrokes 50ms apart: a pause, but shorter than the debounce.
    for (const value of ["e", "ep", "epo"]) {
      fireEvent.change(input, { target: { value } });
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await waitFor(() => expect(searchUrls(fetchMock)).toContain("/api/v1/pools/search?q=epo"));

    expect(searchUrls(fetchMock)).toEqual(["/api/v1/pools/search?q=", "/api/v1/pools/search?q=epo"]);
  });

  it("says when nothing matches", async () => {
    stubFetch(lookupOk(), []);
    render(<PoolFinder selectedPool={null} onSelect={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Find your pool"), { target: { value: "zzz" } });

    expect(await screen.findByText("No pool on this network matches “zzz”.")).toBeInTheDocument();
  });

  it("hides the list for a pasted pool id and does not search it", async () => {
    const fetchMock = stubFetch(lookupOk(), [SUMMARY]);
    render(<PoolFinder selectedPool={null} onSelect={vi.fn()} />);
    await screen.findByRole("button", { name: /\[EPORA\]/ });

    fireEvent.change(screen.getByLabelText("Find your pool"), { target: { value: BASE_POOL.poolId } });

    expect(screen.queryByRole("button", { name: /\[EPORA\]/ })).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(searchUrls(fetchMock)).toEqual(["/api/v1/pools/search?q="]);
  });
});

it("does not let Enter open a row left over from the previous search", async () => {
  // keepPreviousData keeps the shortlist on screen while the search for the typed text
  // loads. Enter used to open the shortlist's top row, a pool the reader never searched.
  const lookup = vi.fn<FetchImpl>(async () => new Response(JSON.stringify({ pool: BASE_POOL })));
  vi.stubGlobal("fetch", vi.fn((url: string, init: RequestInit) =>
    url === "/api/v1/pools/search?q="
      ? Promise.resolve(new Response(JSON.stringify({ pools: [{ ...BASE_POOL, ticker: "OLD" }] })))
      : url.startsWith("/api/v1/pools/search")
        ? new Promise<Response>(() => {})
        : lookup(url, init)
  ));
  render(<PoolFinder selectedPool={null} onSelect={vi.fn()} />);
  await screen.findByRole("button", { name: /\[OLD\]/ });
  const input = screen.getByLabelText("Find your pool");

  fireEvent.change(input, { target: { value: "epo" } });
  await new Promise((resolve) => setTimeout(resolve, 400));
  fireEvent.keyDown(input, { key: "Enter" });

  expect(screen.getByRole("button", { name: /\[OLD\]/ })).toBeInTheDocument();
  expect(lookup).not.toHaveBeenCalled();
});

describe("review fixes", () => {
  const OTHER_ID = "pool1zyxwvutsrqponmlkjihgfedcba9876543210zyxwvutsrqponml";
  const summary = (poolId: string, ticker: string) => ({
    poolId, ticker, name: ticker, saturation: 0.1, liveStakeLovelace: "1",
    marginPct: 0.01, fixedCostLovelace: "1", retiring: false
  });

  it("searches a partial pool id instead of treating it as a full one", async () => {
    const lookup = vi.fn<FetchImpl>(async () => new Response(JSON.stringify({ pool: BASE_POOL })));
    const fetchMock = stubFetch(lookup, [summary(BASE_POOL.poolId, "EPORA")]);
    render(<PoolFinder selectedPool={null} onSelect={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Find your pool"), { target: { value: "pool1abc" } });

    await waitFor(() =>
      expect(fetchMock.mock.calls.map(([url]) => url)).toContain("/api/v1/pools/search?q=pool1abc")
    );
    expect(await screen.findByRole("button", { name: /\[EPORA\]/ })).toBeInTheDocument();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("shows the second row clicked, not the first, when the first is still loading", async () => {
    const pending = new Map<string, (response: Response) => void>();
    const lookup = vi.fn<FetchImpl>((url) => new Promise<Response>((resolve) => pending.set(url, resolve)));
    stubFetch(lookup, [summary(BASE_POOL.poolId, "FIRST"), summary(OTHER_ID, "SECOND")]);
    render(<PoolFinder selectedPool={null} onSelect={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: /\[FIRST\]/ }));
    // The first click put a full id in the box, which hides the list; typing brings it back.
    fireEvent.change(screen.getByLabelText("Find your pool"), { target: { value: "sec" } });
    fireEvent.click(await screen.findByRole("button", { name: /\[SECOND\]/ }));
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(2));
    pending.get(`/api/v1/pools?id=${OTHER_ID}`)?.(
      new Response(JSON.stringify({ pool: { ...BASE_POOL, poolId: OTHER_ID, ticker: "SECOND" } }))
    );

    expect(await screen.findByText("[SECOND]")).toBeInTheDocument();
    expect(screen.getByLabelText("Find your pool")).toHaveValue(OTHER_ID);
  });

  it("drops the empty-box hint once the reader types", () => {
    stubFetch(vi.fn<FetchImpl>());
    render(<PoolFinder selectedPool={null} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Look up/ }));
    expect(screen.getByText("Type a ticker, a pool name or a pool id (pool1…).")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Find your pool"), { target: { value: "e" } });

    expect(screen.queryByText("Type a ticker, a pool name or a pool id (pool1…).")).not.toBeInTheDocument();
  });

  it("drops a lookup error once the text no longer names that pool", async () => {
    stubFetch(vi.fn<FetchImpl>(async () => new Response(JSON.stringify({ error: "Pool not found" }), { status: 404 })));
    render(<PoolFinder selectedPool={null} onSelect={vi.fn()} />);
    const input = screen.getByLabelText("Find your pool");
    fireEvent.change(input, { target: { value: OTHER_ID } });
    fireEvent.click(screen.getByRole("button", { name: /Look up/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Pool not found"));

    fireEvent.change(input, { target: { value: "epo" } });

    expect(screen.queryByText("Pool not found")).not.toBeInTheDocument();
  });

  it("says there is nothing to suggest, not that an empty search matched nothing", async () => {
    stubFetch(vi.fn<FetchImpl>(), []);
    render(<PoolFinder selectedPool={null} onSelect={vi.fn()} />);

    expect(await screen.findByText("No open pools to suggest right now. Search by ticker or name.")).toBeInTheDocument();
    expect(screen.queryByText(/matches “”/)).not.toBeInTheDocument();
  });
});

it("opens the top match when Enter comes before the matches do", async () => {
  // Enter inside the 250 ms debounce used to do nothing and say nothing.
  const lookup = vi.fn<FetchImpl>(async () => new Response(JSON.stringify({ pool: BASE_POOL })));
  stubFetch(lookup, [{
    poolId: BASE_POOL.poolId, ticker: "EPORA", name: "Epora", saturation: 0.1,
    liveStakeLovelace: "1", marginPct: 0.01, fixedCostLovelace: "1", retiring: false
  }]);
  render(<PoolFinder selectedPool={null} onSelect={vi.fn()} />);
  const input = screen.getByLabelText("Find your pool");

  fireEvent.change(input, { target: { value: "epo" } });
  fireEvent.keyDown(input, { key: "Enter" });

  expect(await screen.findByRole("button", { name: "Pick this pool" })).toBeInTheDocument();
  expect(lookup).toHaveBeenCalledWith(`/api/v1/pools?id=${BASE_POOL.poolId}`, expect.anything());
});

it("forgets a pending Enter when the search fails, so a later refetch opens nothing", async () => {
  let failSearch = true;
  const lookup = vi.fn<FetchImpl>(async () => new Response(JSON.stringify({ pool: BASE_POOL })));
  vi.stubGlobal("fetch", vi.fn((url: string, init: RequestInit) => {
    if (url === "/api/v1/pools/search?q=") return Promise.resolve(new Response(JSON.stringify({ pools: [] })));
    if (url.startsWith("/api/v1/pools/search")) {
      return Promise.resolve(failSearch
        ? new Response(JSON.stringify({ error: "bad" }), { status: 400 })
        : new Response(JSON.stringify({ pools: [{
            poolId: BASE_POOL.poolId, ticker: "EPORA", name: "Epora", saturation: 0.1,
            liveStakeLovelace: "1", marginPct: 0.01, fixedCostLovelace: "1", retiring: false
          }] })));
    }
    return lookup(url, init);
  }));
  render(<PoolFinder selectedPool={null} onSelect={vi.fn()} />);
  const input = screen.getByLabelText("Find your pool");
  fireEvent.change(input, { target: { value: "epo" } });
  fireEvent.keyDown(input, { key: "Enter" });
  await screen.findByText("Couldn't load the pool list. You can still paste a pool id.");

  failSearch = false;
  await context.queryClient.refetchQueries({ queryKey: ["pool-search"] });
  await screen.findByRole("button", { name: /\[EPORA\]/ });
  // Opening a pool writes its id into the box at once and fetches it a render later.
  await new Promise((resolve) => setTimeout(resolve, 100));

  expect(input).toHaveValue("epo");
  expect(lookup).not.toHaveBeenCalled();
});

it("does not queue an Enter pressed after the search already failed", async () => {
  let failSearch = true;
  const lookup = vi.fn<FetchImpl>(async () => new Response(JSON.stringify({ pool: BASE_POOL })));
  vi.stubGlobal("fetch", vi.fn((url: string, init: RequestInit) => {
    if (url === "/api/v1/pools/search?q=") return Promise.resolve(new Response(JSON.stringify({ pools: [] })));
    if (url.startsWith("/api/v1/pools/search")) {
      return Promise.resolve(failSearch
        ? new Response(JSON.stringify({ error: "bad" }), { status: 400 })
        : new Response(JSON.stringify({ pools: [{
            poolId: BASE_POOL.poolId, ticker: "EPORA", name: "Epora", saturation: 0.1,
            liveStakeLovelace: "1", marginPct: 0.01, fixedCostLovelace: "1", retiring: false
          }] })));
    }
    return lookup(url, init);
  }));
  render(<PoolFinder selectedPool={null} onSelect={vi.fn()} />);
  const input = screen.getByLabelText("Find your pool");
  fireEvent.change(input, { target: { value: "epo" } });
  await screen.findByText("Couldn't load the pool list. You can still paste a pool id.");

  fireEvent.keyDown(input, { key: "Enter" });
  failSearch = false;
  await context.queryClient.refetchQueries({ queryKey: ["pool-search"] });
  await screen.findByRole("button", { name: /\[EPORA\]/ });
  await new Promise((resolve) => setTimeout(resolve, 100));

  expect(input).toHaveValue("epo");
  expect(lookup).not.toHaveBeenCalled();
});

it("caps the box at the longest search the server accepts", () => {
  stubFetch(vi.fn<FetchImpl>());
  render(<PoolFinder selectedPool={null} onSelect={vi.fn()} />);

  expect(screen.getByLabelText("Find your pool")).toHaveAttribute("maxLength", "64");
});
