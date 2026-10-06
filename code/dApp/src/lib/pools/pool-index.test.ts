import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  buildPoolIndex,
  getPoolIndex,
  POOL_INDEX_TTL_MS,
  POOL_PAGE_SIZE,
  POOL_SEARCH_LIMIT,
  POOL_SHORTLIST_SIZE,
  resetPoolIndexForTests,
  searchPools,
  shortlistPools,
  type PoolIndexEntry
} from "./pool-index";

function entry(overrides: Partial<PoolIndexEntry> & { poolId: string }): PoolIndexEntry {
  return {
    ticker: null,
    name: null,
    saturation: 0.5,
    liveStakeLovelace: "1000000",
    marginPct: 0.01,
    fixedCostLovelace: "170000000",
    retiring: false,
    ...overrides
  };
}

function rawPool(id: number, ticker: string | null = `T${id}`) {
  return {
    pool_id: `pool1${id}`,
    live_stake: "5",
    live_saturation: 0.2,
    margin_cost: 0.02,
    fixed_cost: "340000000",
    metadata: ticker ? { ticker, name: `Pool ${id}` } : null
  };
}

function meshHttpError(status: number) {
  return JSON.stringify({ data: { status_code: status }, headers: {}, status });
}

/** A Blockfrost fake: `total` extended pools, `retiringIds` retiring, 404 past the end. */
function fakeGet(total: number, retiringIds: string[] = []) {
  const calls: string[] = [];
  const get = async (path: string) => {
    calls.push(path);
    const url = new URL(path, "http://x");
    const page = Number(url.searchParams.get("page"));
    if (url.pathname === "/pools/retiring") {
      return page === 1 ? retiringIds.map((pool_id) => ({ pool_id, epoch: 1 })) : [];
    }
    const start = (page - 1) * POOL_PAGE_SIZE;
    if (start >= total) throw meshHttpError(404);
    return Array.from({ length: Math.min(POOL_PAGE_SIZE, total - start) }, (_, i) => rawPool(start + i));
  };
  return { get, calls };
}

describe("buildPoolIndex", () => {
  it("reads every page, past the first batch, and marks retiring pools", async () => {
    const { get } = fakeGet(1_234, ["pool17"]);

    const index = await buildPoolIndex(get);

    assert.equal(index.length, 1_234);
    assert.deepEqual(index[7], {
      poolId: "pool17",
      ticker: "T7",
      name: "Pool 7",
      saturation: 0.2,
      liveStakeLovelace: "5",
      marginPct: 0.02,
      fixedCostLovelace: "340000000",
      retiring: true
    });
    assert.equal(index.filter((pool) => pool.retiring).length, 1);
  });

  it("stops at the first short page instead of walking every page", async () => {
    const { get, calls } = fakeGet(250);

    await buildPoolIndex(get);

    // One batch of ten pages per list, nothing after the short third page's batch.
    assert.equal(calls.filter((path) => path.startsWith("/pools/extended")).length, 10);
  });

  it("keeps a pool with no metadata, with null ticker and name", async () => {
    const get = async (path: string) => (path.startsWith("/pools/extended") ? [rawPool(1, null)] : []);

    const [pool] = await buildPoolIndex(get);

    assert.equal(pool.ticker, null);
    assert.equal(pool.name, null);
  });

  it("fails on an upstream error that is not a 404", async () => {
    const get = async () => {
      throw meshHttpError(503);
    };

    await assert.rejects(buildPoolIndex(get));
  });
});

describe("getPoolIndex", () => {
  beforeEach(resetPoolIndexForTests);

  it("shares one build between concurrent callers and caches it for the TTL", async () => {
    const { get, calls } = fakeGet(3);

    await Promise.all([getPoolIndex(get), getPoolIndex(get)]);
    await getPoolIndex(get);
    const builds = calls.filter((path) => path === "/pools/extended?count=100&page=1").length;

    assert.equal(builds, 1);
  });

  it("rebuilds once the TTL has passed", async () => {
    const { get, calls } = fakeGet(3);

    await getPoolIndex(get);
    await getPoolIndex(get, Date.now() + POOL_INDEX_TTL_MS + 1);
    const builds = calls.filter((path) => path === "/pools/extended?count=100&page=1").length;

    assert.equal(builds, 2);
  });

  it("does not cache a failed build", async () => {
    let fail = true;
    const get = async (path: string) => {
      if (fail) throw meshHttpError(503);
      return path === "/pools/extended?count=100&page=1" ? [rawPool(1)] : [];
    };

    await assert.rejects(getPoolIndex(get));
    fail = false;

    assert.equal((await getPoolIndex(get)).length, 1);
  });
});

describe("searchPools", () => {
  const index = [
    entry({ poolId: "pool1aaa", ticker: "XEPORA", name: "Other" }),
    entry({ poolId: "pool1bbb", ticker: "BETA", name: "Epora Two" }),
    entry({ poolId: "pool1ccc", ticker: "EPORA", name: "Epora One" }),
    entry({ poolId: "pool1ddd", ticker: "EPO", name: "Unrelated" }),
    entry({ poolId: "pool1eee" })
  ];

  it("ranks ticker prefix (exact first), then name prefix, then contains", () => {
    const ids = searchPools(index, "epora").map((pool) => pool.poolId);

    assert.deepEqual(ids, ["pool1ccc", "pool1bbb", "pool1aaa"]);
  });

  it("ignores case and surrounding space", () => {
    assert.equal(searchPools(index, "  Epo ")[0].ticker, "EPO");
  });

  it("matches a bech32 pool id prefix, so a pasted id finds a pool without metadata", () => {
    assert.deepEqual(searchPools(index, "pool1eee").map((pool) => pool.poolId), ["pool1eee"]);
  });

  it("returns nothing for an empty query", () => {
    assert.deepEqual(searchPools(index, "  "), []);
  });

  it("caps the number of matches", () => {
    const many = Array.from({ length: 50 }, (_, i) => entry({ poolId: `pool1x${i}`, ticker: `ADA${i}` }));

    assert.equal(searchPools(many, "ada").length, POOL_SEARCH_LIMIT);
  });
});

describe("shortlistPools", () => {
  it("only offers open pools that publish a ticker", () => {
    const index = [
      entry({ poolId: "pool1ok", ticker: "OK" }),
      entry({ poolId: "pool1nometa" }),
      entry({ poolId: "pool1retiring", ticker: "RET", retiring: true }),
      entry({ poolId: "pool1full", ticker: "FULL", saturation: 0.95 }),
      entry({ poolId: "pool1empty", ticker: "EMPTY", saturation: 0 }),
      entry({ poolId: "pool1unknown", ticker: "UNK", saturation: null }),
      entry({ poolId: "pool1greedy", ticker: "GREED", marginPct: 1 }),
      entry({ poolId: "pool1nomargin", ticker: "NOMRG", marginPct: null })
    ];

    assert.deepEqual(shortlistPools(index).map((pool) => pool.poolId), ["pool1ok"]);
  });

  it("returns a fixed-size random sample without repeats", () => {
    const index = Array.from({ length: 40 }, (_, i) => entry({ poolId: `pool1p${i}`, ticker: `P${i}` }));

    const picked = shortlistPools(index).map((pool) => pool.poolId);

    assert.equal(picked.length, POOL_SHORTLIST_SIZE);
    assert.equal(new Set(picked).size, POOL_SHORTLIST_SIZE);
  });

  it("depends on the random source, not on index order", () => {
    const index = Array.from({ length: 40 }, (_, i) => entry({ poolId: `pool1p${i}`, ticker: `P${i}` }));

    const first = shortlistPools(index, () => 0).map((pool) => pool.poolId);
    const last = shortlistPools(index, () => 0.999).map((pool) => pool.poolId);

    assert.notDeepEqual(first, last);
    assert.equal(last[0], "pool1p39");
  });
});
