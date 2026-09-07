import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { buildOpenApiDocument } from "@/lib/api/openapi";
import { MAX_ON_CHAIN_STATE_INTEGER } from "@/lib/contracts/on-chain-integer";
import { TX_RATE_LIMIT_DEFAULTS } from "@/lib/http/tx-rate-limit";

// Generation guarantees the document's schemas are the routes' schemas. It
// guarantees nothing about which routes exist: a new route is simply absent,
// and a deleted route lingers. These two directions close that gap.

const API_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../app/api"
);

/** Every route handler on disk, as the URL path Next.js serves it at. */
function routePathsOnDisk(directory = API_ROOT, prefix = "/api"): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const absolute = path.join(directory, entry);
    if (statSync(absolute).isDirectory()) {
      found.push(...routePathsOnDisk(absolute, `${prefix}/${entry}`));
    } else if (entry === "route.ts" || entry === "route.tsx") {
      found.push(prefix);
    }
  }
  return found;
}

// Routes the spec deliberately omits, each with the reason the developer guide
// gives. Adding a route here is a decision to keep it out of the public
// contract, not a way to silence this test.
const DELIBERATELY_UNDOCUMENTED = new Map([
  ["/api/mesh", "Chain-read proxy for the app's own browser client."],
  ["/api/shared-helper", "Shared setup reference discovery for the app's own browser client."],
  ["/api/stt/sync", "Indexer trigger, gated by a shared secret."],
  ["/api/koios/credential-utxos", "CORS proxy for Koios."],
  ["/api/proposals", "Multi-signature coordination, session-gated."],
  ["/api/proposals/[id]", "Multi-signature coordination, session-gated."],
  ["/api/proposals/[id]/rebuild", "Multi-signature coordination, session-gated."],
  ["/api/proposals/[id]/sign", "Multi-signature coordination, session-gated."],
  ["/api/proposals/[id]/submit", "Multi-signature coordination, session-gated."],
  ["/api/proposals/auth", "Multi-signature coordination, session-gated."],
  ["/api/proposals/auth/nonce", "Multi-signature coordination, session-gated."],
  // The document describes itself; describing that entry would be circular.
  ["/api/v1/openapi.json", "Serves this document."],
  ["/api/v1/docs", "Interactive HTML viewer over the document, not an API operation."]
]);

function emittedPatterns(schema: unknown): string[] {
  if (!schema || typeof schema !== "object") {
    return [];
  }

  const node = schema as { pattern?: unknown; allOf?: unknown };
  return [
    ...(typeof node.pattern === "string" ? [node.pattern] : []),
    ...(Array.isArray(node.allOf) ? node.allOf.flatMap(emittedPatterns) : [])
  ];
}

describe("spec coverage", () => {
  const documented = new Set(Object.keys(buildOpenApiDocument().paths ?? {}));
  const onDisk = routePathsOnDisk();

  it("finds the route handlers", () => {
    // A resolution or traversal mistake would make both directions below pass
    // vacuously, so assert the inventory is real before comparing it.
    assert.ok(onDisk.length >= 13, `expected at least 13 route handlers, found ${onDisk.length}`);
    assert.ok(onDisk.includes("/api/v1/tx/mint"));
  });

  it("documents every route that is not deliberately private", () => {
    const missing = onDisk
      .filter((route) => !documented.has(route))
      .filter((route) => !DELIBERATELY_UNDOCUMENTED.has(route));

    assert.deepEqual(
      missing,
      [],
      `these routes exist but the spec does not describe them: ${missing.join(", ")}`
    );
  });

  it("describes no route that does not exist", () => {
    const phantom = [...documented].filter((route) => !onDisk.includes(route));

    assert.deepEqual(
      phantom,
      [],
      `the spec describes these paths but no handler serves them: ${phantom.join(", ")}`
    );
  });

  it("keeps the private list honest: every entry still exists", () => {
    const gone = [...DELIBERATELY_UNDOCUMENTED.keys()].filter(
      (route) => !onDisk.includes(route)
    );

    assert.deepEqual(
      gone,
      [],
      `these routes are listed as deliberately private but no longer exist: ${gone.join(", ")}`
    );
  });

  it("gives every operation an operationId, which tooling needs", () => {
    const paths = buildOpenApiDocument().paths ?? {};
    const withoutId: string[] = [];

    for (const [route, item] of Object.entries(paths)) {
      for (const [method, operation] of Object.entries(item as Record<string, unknown>)) {
        const candidate = operation as { operationId?: string } | undefined;
        if (candidate && typeof candidate === "object" && !candidate.operationId) {
          withoutId.push(`${method.toUpperCase()} ${route}`);
        }
      }
    }

    assert.deepEqual(withoutId, []);
  });

  it("documents the retired wallet spend route as deprecated with only 410", () => {
    const operation = buildOpenApiDocument().paths?.["/api/v1/tx/wallet-spend"]?.post;

    assert.equal(operation?.operationId, "buildWalletSpendTx");
    assert.equal(operation?.deprecated, true);
    assert.deepEqual(Object.keys(operation?.responses ?? {}), ["410"]);
  });

  it("documents both weighted wallet-input limits", () => {
    const response = buildOpenApiDocument().paths?.["/api/v1/tx/stt-spend"]?.post
      ?.responses?.["429"] as { description?: string } | undefined;
    const description = response?.description ?? "";

    assert.match(description, /one unit per declared wallet input/);
    assert.ok(
      description.includes(
        `default client budget is ${TX_RATE_LIMIT_DEFAULTS.perClientWalletInputs} units per ${TX_RATE_LIMIT_DEFAULTS.perClientWindowMs / 1000} seconds`
      )
    );
    assert.ok(
      description.includes(
        `deployment-wide default is ${TX_RATE_LIMIT_DEFAULTS.globalWalletInputs} units per ${TX_RATE_LIMIT_DEFAULTS.globalWindowMs / 1000} seconds`
      )
    );
  });

  it("emits the exact uint64 magnitude for decimal-string integers", () => {
    const schemas = buildOpenApiDocument().components?.schemas as
      | Record<string, { properties?: Record<string, unknown> }>
      | undefined;
    const nonNegativeStringSchemas = [
      ["Asset.quantity", schemas?.Asset?.properties?.quantity],
      ["OnChainUint64.int", schemas?.OnChainUint64?.properties?.int]
    ] as const;
    const maximum = MAX_ON_CHAIN_STATE_INTEGER.toString();
    const tooLarge = (MAX_ON_CHAIN_STATE_INTEGER + 1n).toString();

    for (const [label, schema] of nonNegativeStringSchemas) {
      const patterns = emittedPatterns(schema).map((pattern) => new RegExp(pattern));
      assert.ok(patterns.length > 0, `${label} must emit a decimal bound`);
      assert.ok(patterns.every((pattern) => pattern.test(maximum)), `${label} rejects uint64 max`);
      assert.ok(patterns.every((pattern) => !pattern.test("-1")), `${label} accepts a negative`);
      assert.ok(
        patterns.some((pattern) => !pattern.test(tooLarge)),
        `${label} accepts uint64 max plus one`
      );
    }

    const signedPatterns = emittedPatterns(
      schemas?.PlutusInteger?.properties?.int
    ).map((pattern) => new RegExp(pattern));
    assert.ok(signedPatterns.length > 0, "PlutusInteger.int must emit a decimal bound");
    assert.ok(signedPatterns.every((pattern) => pattern.test(`-${maximum}`)));
    assert.ok(signedPatterns.every((pattern) => !pattern.test(`-${tooLarge}`)));
    assert.ok(signedPatterns.every((pattern) => !pattern.test(tooLarge)));
  });
});
