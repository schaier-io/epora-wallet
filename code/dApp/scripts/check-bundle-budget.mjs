#!/usr/bin/env node
/**
 * First-load JavaScript budget gate for the dApp (issue #410).
 *
 * Read-only: it loads the production build's route bundle stats, asserts every
 * served page route against its named first-load JS budget (scripts/lib/
 * bundle-budget.mjs), prints each route's measured size, and exits nonzero on
 * the first family of violations.
 *
 * The stats file (.next/diagnostics/route-bundle-stats.json) only exists after
 * a production build, so `pnpm build` must have run first; the CI wiring does
 * this in the step right before this check. Budgets are decoded (uncompressed)
 * kilobytes so the gate measures what the browser parses, independent of the
 * serving layer's compression.
 *
 * The dApp root is resolved from this script's own location, so the check
 * behaves the same whether it is invoked from the repo root or from code/dApp.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateRouteBundleStats } from "./lib/bundle-budget.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const dAppRoot = join(scriptDir, "..");
const statsPath = join(dAppRoot, ".next", "diagnostics", "route-bundle-stats.json");

function fail(message) {
  console.error(`check-bundle-budget: ${message}`);
  process.exit(1);
}

let statsFile;
try {
  statsFile = readFileSync(statsPath, "utf8");
} catch {
  fail(
    `no build stats found at ${statsPath}.\n` +
      "The gate reads the production build output, so run `pnpm build` first."
  );
}

let stats;
try {
  stats = JSON.parse(statsFile);
} catch (error) {
  fail(`route bundle stats are not valid JSON: ${error.message}`);
}

let violations;
try {
  violations = evaluateRouteBundleStats(stats);
} catch (error) {
  fail(`route bundle stats have an unexpected shape: ${error.message}`);
}

for (const entry of stats) {
  console.log(`${entry.route}: ${Math.round(entry.firstLoadUncompressedJsBytes / 1024)} KB first-load JS`);
}

if (violations.length > 0) {
  console.error("");
  for (const violation of violations) {
    console.error(`bundle budget exceeded: ${violation}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Bundle budget OK: ${stats.length} routes checked, all within their first-load JS budgets.`);
}
