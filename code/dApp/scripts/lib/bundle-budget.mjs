/**
 * Logic for the first-load JavaScript budget gate (issue #410). Split from the
 * check-bundle-budget.mjs runner so the gate's own tests can exercise the
 * decision rules against fixture build stats instead of a real .next output.
 *
 * Data source: `.next/diagnostics/route-bundle-stats.json`, which `next build`
 * (Next 16, Turbopack) writes next to the build output. Each entry records a
 * route's `firstLoadUncompressedJsBytes` and the chunk files that make it up;
 * the field was verified to equal the sum of the listed chunk file sizes on
 * the build this gate was written against. The file only exists after a
 * production build, so the runner requires `pnpm build` to have run first.
 *
 * Budgets are uncompressed kilobytes. Compression ratios vary with the deploy
 * layer, so the gate holds the decoded weight the browser must parse, not a
 * gzip figure. The baseline when the budgets were set (branch
 * perf/lazy-mesh-user-proposals, all four guarded routes) was 876 KB per
 * route; 1100 KB leaves ~25% headroom for dependency bumps while still
 * catching the failure mode the gate exists for: one eager Mesh value import
 * adds ~7 MB to a route's first load (measured: /user/proposals carried
 * 8142 KB before its dynamic boundary).
 */

export const KB = 1024;

/** Named per-route first-load JS budgets in KB (decoded bytes). */
export const FIRST_LOAD_JS_BUDGETS_KB = {
  "/": 1100,
  "/user": 1100,
  "/payee": 1100,
  "/setup": 1100,
  "/user/proposals": 1100,
  "/legal": 1100,
  "/privacy": 1100,
  "/terms": 1100,
  "/_not-found": 1100
};

/**
 * Validates one entry of route-bundle-stats.json and returns a normalised
 * { route, bytes } pair. Throws on a shape the gate does not understand, so a
 * Next.js change to the diagnostics format fails loudly instead of passing
 * vacuously.
 */
export function parseRouteStat(entry) {
  const route = entry?.route;
  const bytes = entry?.firstLoadUncompressedJsBytes;
  if (typeof route !== "string" || route.length === 0) {
    throw new Error(
      `route-bundle-stats entry has no usable "route" field: ${JSON.stringify(entry)}`
    );
  }
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new Error(
      `route-bundle-stats entry for ${route} has no usable "firstLoadUncompressedJsBytes": ${JSON.stringify(bytes)}`
    );
  }
  return { route, bytes };
}

/**
 * Compares build stats against the named budgets. A route fails when it
 * exceeds its budget, when it is served but has no budget (a new heavy route
 * must not ship silently), or when a budgeted route is missing from the
 * build (the budget must not stop covering a route without anyone deciding
 * that). A route exactly at its budget passes.
 */
export function evaluateRouteBundleStats(stats, budgets = FIRST_LOAD_JS_BUDGETS_KB) {
  if (!Array.isArray(stats)) {
    throw new Error("route bundle stats must be an array of per-route entries");
  }

  const measured = new Map();
  for (const entry of stats) {
    const { route, bytes } = parseRouteStat(entry);
    if (measured.has(route)) {
      throw new Error(`route bundle stats list ${route} twice`);
    }
    measured.set(route, bytes);
  }

  const violations = [];
  for (const [route, budgetKb] of Object.entries(budgets)) {
    const bytes = measured.get(route);
    if (bytes === undefined) {
      violations.push(
        `${route}: no build stats found, but a budget (${budgetKb} KB) is configured`
      );
      continue;
    }
    if (bytes > budgetKb * KB) {
      violations.push(
        `${route}: first-load JS ${Math.round(bytes / KB)} KB exceeds the ${budgetKb} KB budget`
      );
    }
  }
  for (const route of measured.keys()) {
    if (!(route in budgets)) {
      violations.push(
        `${route}: served route has no first-load JS budget; add one to FIRST_LOAD_JS_BUDGETS_KB`
      );
    }
  }
  return violations;
}
