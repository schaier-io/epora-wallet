import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  buildDrepIndex,
  DREP_BATCH_SIZE,
  DREP_INDEX_RETRY_MS,
  DREP_INDEX_TTL_MS,
  DREP_SEARCH_LIMIT,
  DREP_SHORTLIST_SIZE,
  DrepIndexBackoffError,
  getDrepIndex,
  KOIOS_PAGE_ROWS,
  KoiosDrepsError,
  resetDrepIndexForTests,
  searchDreps,
  shortlistDreps,
  type DrepIndexEntry,
  type KoiosCall
} from "./drep-index";

function entry(overrides: Partial<DrepIndexEntry> & { drepId: string }): DrepIndexEntry {
  return { name: null, votingPowerLovelace: "1", hasScript: false, status: "active", ...overrides };
}

type Call = { path: string; body?: unknown };

/**
 * A Koios fake with `total` registered DReps `drep1d<i>`. Info and metadata answer every
 * requested id; `info` and `name` shape each row.
 */
function fakeKoios(
  total: number,
  {
    info = () => ({}),
    name = (id: string) => `Name ${id}`
  }: { info?: (id: string) => Record<string, unknown>; name?: (id: string) => unknown } = {}
) {
  const calls: Call[] = [];
  const call: KoiosCall = async (path, body) => {
    calls.push({ path, body });
    const url = new URL(path, "http://x");
    if (url.pathname === "/drep_list") {
      const offset = Number(url.searchParams.get("offset"));
      return Array.from({ length: Math.max(0, Math.min(KOIOS_PAGE_ROWS, total - offset)) }, (_, i) => ({
        drep_id: `drep1d${offset + i}`
      }));
    }
    const ids = (body as { _drep_ids: string[] })._drep_ids;
    if (url.pathname === "/drep_info") {
      return ids.map((drep_id) => ({
        drep_id,
        drep_status: "registered",
        active: true,
        amount: "42",
        has_script: false,
        ...info(drep_id)
      }));
    }
    if (url.pathname === "/drep_metadata") return ids.map((drep_id) => ({ drep_id, name: name(drep_id) }));
    throw new Error(`unexpected path ${path}`);
  };
  return { call, calls };
}

describe("buildDrepIndex", () => {
  it("reads every list page and joins status, power and name per DRep", async () => {
    const { call, calls } = fakeKoios(1_234, {
      info: (id) => (id === "drep1d7" ? { active: false, has_script: true, amount: "9" } : {})
    });

    const index = await buildDrepIndex(call);

    assert.equal(index.length, 1_234);
    assert.deepEqual(index.find((drep) => drep.drepId === "drep1d7"), {
      drepId: "drep1d7",
      name: "Name drep1d7",
      votingPowerLovelace: "9",
      hasScript: true,
      status: "inactive"
    });
    assert.equal(calls.filter((c) => c.path.startsWith("/drep_list")).length, 2);
  });

  it("asks for at most one batch of ids per request, so Koios does not answer 413", async () => {
    const { call, calls } = fakeKoios(DREP_BATCH_SIZE * 2 + 1);

    await buildDrepIndex(call);
    const posts = calls.filter((c) => c.body !== undefined);

    assert.equal(posts.length, 6, "three batches for info, three for metadata");
    for (const post of posts) {
      const ids = (post.body as { _drep_ids: string[] })._drep_ids;
      assert.ok(ids.length <= DREP_BATCH_SIZE);
      // Koios refuses a body over 5 KB. A CIP-129 id is 58 characters.
      assert.ok(JSON.stringify({ _drep_ids: ids.map(() => "x".repeat(58)) }).length < 5_000);
    }
  });

  it("reads a JSON-LD `@value` name and keeps a DRep without a name", async () => {
    const { call } = fakeKoios(3, {
      name: (id) => (id === "drep1d0" ? { "@value": " Wrapped " } : id === "drep1d1" ? null : "  ")
    });

    const names = (await buildDrepIndex(call)).map((drep) => drep.name);

    assert.deepEqual(names, ["Wrapped", null, null]);
  });

  it("drops a DRep that retired between the list and the info call", async () => {
    const { call } = fakeKoios(2, { info: (id) => (id === "drep1d1" ? { drep_status: "deregistered" } : {}) });

    assert.deepEqual((await buildDrepIndex(call)).map((drep) => drep.drepId), ["drep1d0"]);
  });

  it("does not trust a voting power that is not a whole lovelace string", async () => {
    const { call } = fakeKoios(1, { info: () => ({ amount: 12 }) });

    assert.equal((await buildDrepIndex(call))[0].votingPowerLovelace, null);
  });

  it("fails when Koios fails", async () => {
    const call: KoiosCall = async () => {
      throw new KoiosDrepsError(503, null);
    };

    await assert.rejects(buildDrepIndex(call), KoiosDrepsError);
  });
});

describe("getDrepIndex", () => {
  beforeEach(resetDrepIndexForTests);

  const listCalls = (calls: Call[]) => calls.filter((c) => c.path.startsWith("/drep_list")).length;

  it("shares one build between concurrent callers and caches it for the TTL", async () => {
    const { call, calls } = fakeKoios(3);

    await Promise.all([getDrepIndex(call), getDrepIndex(call)]);
    await getDrepIndex(call);

    assert.equal(listCalls(calls), 1);
  });

  it("serves the expired index while it rebuilds, then the new one", async () => {
    let total = 1;
    const calls: Call[] = [];
    const call: KoiosCall = (path, body) => {
      const fake = fakeKoios(total);
      calls.push({ path, body });
      return fake.call(path, body);
    };
    await getDrepIndex(call, Date.now());
    total = 2;
    // The TTL runs from when the build ended, which can be milliseconds after the start.
    const later = Date.now() + DREP_INDEX_TTL_MS + 60_000;

    const stale = await getDrepIndex(call, later);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const fresh = await getDrepIndex(call, later);

    assert.equal(stale.length, 1);
    assert.equal(fresh.length, 2);
    assert.equal(listCalls(calls), 2);
  });

  it("keeps serving the expired index when its rebuild fails", async () => {
    let fail = false;
    let failedCalls = 0;
    const fake = fakeKoios(1);
    const call: KoiosCall = async (path, body) => {
      if (fail) {
        failedCalls++;
        throw new KoiosDrepsError(429, null);
      }
      return fake.call(path, body);
    };
    await getDrepIndex(call, Date.now());
    fail = true;
    const later = Date.now() + DREP_INDEX_TTL_MS + 60_000;

    await getDrepIndex(call, later);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal((await getDrepIndex(call, later)).length, 1);
    assert.ok(failedCalls > 0, "the expired index must have started a rebuild");
  });

  it("waits before retrying a failed build instead of rebuilding on every call", async () => {
    let fail = true;
    let calls = 0;
    const fake = fakeKoios(1);
    const call: KoiosCall = async (path, body) => {
      calls++;
      if (fail) throw new KoiosDrepsError(429, null);
      return fake.call(path, body);
    };
    const start = Date.now();

    await assert.rejects(getDrepIndex(call, start));
    const afterFirst = calls;
    const replay: unknown = await getDrepIndex(call, start + DREP_INDEX_RETRY_MS - 1).catch((error: unknown) => error);
    fail = false;

    assert.equal(calls, afterFirst, "a call inside the retry window must not reach Koios");
    assert.ok(replay instanceof DrepIndexBackoffError);
    assert.equal(replay.retryAfterSeconds, 1);
    assert.equal((await getDrepIndex(call, start + DREP_INDEX_RETRY_MS + 1_000)).length, 1);
  });

  it("waits as long as Koios asked when that is longer than the backoff", async () => {
    const call: KoiosCall = async () => {
      throw new KoiosDrepsError(429, "120");
    };
    const start = Date.now();

    await assert.rejects(getDrepIndex(call, start));
    const replay: unknown = await getDrepIndex(call, start + DREP_INDEX_RETRY_MS + 1_000).catch((error: unknown) => error);

    assert.ok(replay instanceof DrepIndexBackoffError);
    assert.ok(replay.retryAfterSeconds > 60);
  });
});

describe("searchDreps", () => {
  const index = [
    entry({ drepId: "drep1aaa", name: "The Epora Fund" }),
    entry({ drepId: "drep1bbb", name: "Epora Two", status: "inactive" }),
    entry({ drepId: "drep1ccc", name: "Epora One" }),
    entry({ drepId: "drep1ddd", name: "Unrelated" }),
    entry({ drepId: "drep1eee" })
  ];

  it("ranks name prefix before contains, and active before inactive", () => {
    const ids = searchDreps(index, "epora").map((drep) => drep.drepId);

    assert.deepEqual(ids, ["drep1ccc", "drep1bbb", "drep1aaa"]);
  });

  it("ignores case and surrounding space", () => {
    assert.equal(searchDreps(index, "  UNREL ")[0].drepId, "drep1ddd");
  });

  it("matches a bech32 id prefix, so a DRep without a name can still be found", () => {
    assert.deepEqual(searchDreps(index, "drep1eee").map((drep) => drep.drepId), ["drep1eee"]);
  });

  it("does not let a query inside \"drep1\" match every DRep id", () => {
    assert.deepEqual(searchDreps(index, "drep1"), []);
  });

  it("returns nothing for an empty query", () => {
    assert.deepEqual(searchDreps(index, "  "), []);
  });

  it("caps the number of matches", () => {
    const many = Array.from({ length: 50 }, (_, i) => entry({ drepId: `drep1x${i}`, name: `Ada ${i}` }));

    assert.equal(searchDreps(many, "ada").length, DREP_SEARCH_LIMIT);
  });
});

describe("shortlistDreps", () => {
  it("only offers active DReps that publish a name", () => {
    const index = [
      entry({ drepId: "drep1ok", name: "OK" }),
      entry({ drepId: "drep1unnamed" }),
      entry({ drepId: "drep1idle", name: "Idle", status: "inactive" })
    ];

    assert.deepEqual(shortlistDreps(index).map((drep) => drep.drepId), ["drep1ok"]);
  });

  it("returns a fixed-size random sample without repeats", () => {
    const index = Array.from({ length: 40 }, (_, i) => entry({ drepId: `drep1p${i}`, name: `P${i}` }));

    const picked = shortlistDreps(index).map((drep) => drep.drepId);

    assert.equal(picked.length, DREP_SHORTLIST_SIZE);
    assert.equal(new Set(picked).size, DREP_SHORTLIST_SIZE);
  });

  it("depends on the random source, not on index order", () => {
    const index = Array.from({ length: 40 }, (_, i) => entry({ drepId: `drep1p${i}`, name: `P${i}` }));

    const first = shortlistDreps(index, () => 0).map((drep) => drep.drepId);
    const last = shortlistDreps(index, () => 0.999).map((drep) => drep.drepId);

    assert.notDeepEqual(first, last);
    assert.equal(last[0], "drep1p39");
  });

  it("does not reorder the index it was given", () => {
    const index = Array.from({ length: 10 }, (_, i) => entry({ drepId: `drep1p${i}`, name: `P${i}` }));
    const before = index.map((drep) => drep.drepId);

    shortlistDreps(index, () => 0.999);

    assert.deepEqual(index.map((drep) => drep.drepId), before);
  });
});
