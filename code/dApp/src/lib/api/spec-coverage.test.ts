import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { buildOpenApiDocument } from "@/lib/api/openapi";

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
  ["/api/v1/openapi.json", "Serves this document."]
]);

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
});
