#!/usr/bin/env node
// Execution-cost regression gate.
//
// `aiken check` already measures what every unit test costs to evaluate
// (`execution_units.{mem,cpu}` in its JSON report) and `plutus.json` already
// records how large every compiled validator is — both numbers were being
// thrown away. A wallet contract has to fit inside per-transaction execution
// budgets and the 16 KiB script limit, so an accidental 3x in a hot predicate
// is a real regression that no other gate in this repo would catch.
//
// This script snapshots both into `budgets.json` and fails when they move.
// It is a snapshot test, not a threshold: mem/cpu for a unit test is a
// deterministic evaluation, so any drift beyond TOLERANCE is a real change and
// should be looked at and then recorded deliberately.
//
// Usage:
//   node scripts/check-budgets.mjs            # gate (CI + `pnpm verify`)
//   node scripts/check-budgets.mjs --update   # re-record after an intended change
//
// Property tests are skipped: aiken reports `iterations`/`counterexample` for
// them instead of execution units, and their cost depends on the seed.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const budgetsPath = join(projectRoot, "budgets.json");
const blueprintPath = join(projectRoot, "plutus.json");
const update = process.argv.includes("--update");

// Deterministic numbers, so this only absorbs formatter-level noise; it is not
// a licence to drift. Anything above it is reported and must be re-recorded.
const TOLERANCE = 0.01;

function fail(message) {
  console.error(`check-budgets: ${message}`);
  process.exit(1);
}

// --- measure -----------------------------------------------------------------

// stdout is a pipe (not a TTY), so aiken prints the structured JSON report.
const result = spawnSync("aiken", ["check", "-D"], {
  cwd: projectRoot,
  encoding: "utf8",
  maxBuffer: 256 * 1024 * 1024,
});

if (result.error) fail(`failed to run aiken: ${result.error.message}`);
if (result.status !== 0) {
  process.stderr.write(result.stderr ?? "");
  fail("`aiken check -D` failed — fix that first, then re-run.");
}

const report = JSON.parse(result.stdout);

/** `<module>.<test>` -> {mem, cpu} for every unit test. */
const measuredTests = {};
for (const module of report.modules) {
  for (const test of module.tests) {
    if (!test.execution_units) continue; // property test
    measuredTests[`${module.name}.${test.title}`] = {
      mem: test.execution_units.mem,
      cpu: test.execution_units.cpu,
    };
  }
}

/** validator title -> {size} in bytes (the compiledCode hex string / 2). */
const measuredScripts = {};
const blueprint = JSON.parse(readFileSync(blueprintPath, "utf8"));
for (const validator of blueprint.validators) {
  if (!validator.compiledCode) continue;
  measuredScripts[validator.title] = { size: validator.compiledCode.length / 2 };
}

// --- record ------------------------------------------------------------------

if (update) {
  const measured = { tests: measuredTests, scripts: measuredScripts };
  writeFileSync(budgetsPath, `${JSON.stringify(measured, null, 2)}\n`);
  const testCount = Object.keys(measuredTests).length;
  const scriptCount = Object.keys(measuredScripts).length;
  console.log(
    `check-budgets: recorded ${testCount} unit tests and ${scriptCount} scripts into budgets.json`,
  );
  process.exit(0);
}

// --- compare -----------------------------------------------------------------

let recorded;
try {
  recorded = JSON.parse(readFileSync(budgetsPath, "utf8"));
} catch {
  fail("budgets.json is missing or unreadable — run `pnpm budgets:update`.");
}

const problems = [];

function compare(kind, recordedEntries, measuredEntries, metrics) {
  for (const name of Object.keys(measuredEntries)) {
    if (!(name in recordedEntries)) {
      problems.push(`${kind} not tracked yet: ${name}`);
    }
  }
  for (const name of Object.keys(recordedEntries)) {
    if (!(name in measuredEntries)) {
      problems.push(`${kind} recorded but gone: ${name}`);
      continue;
    }
    for (const metric of metrics) {
      const before = recordedEntries[name][metric];
      const after = measuredEntries[name][metric];
      if (before === after) continue;
      const delta = (after - before) / before;
      if (Math.abs(delta) <= TOLERANCE) continue;
      const sign = delta > 0 ? "+" : "";
      problems.push(
        `${kind} ${name} ${metric}: ${before} -> ${after} (${sign}${(delta * 100).toFixed(1)}%)`,
      );
    }
  }
}

compare("test", recorded.tests ?? {}, measuredTests, ["mem", "cpu"]);
compare("script", recorded.scripts ?? {}, measuredScripts, ["size"]);

if (problems.length > 0) {
  console.error("check-budgets: execution budgets moved\n");
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(
    "\nReview the deltas above. If they are intended, re-record them with:\n" +
      "  pnpm budgets:update\n" +
      "and say why in the commit message.",
  );
  process.exit(1);
}

const totalCpu = Object.values(measuredTests).reduce((n, t) => n + t.cpu, 0);
const largestScript = Math.max(
  ...Object.values(measuredScripts).map((s) => s.size),
);
console.log(
  `check-budgets: ${Object.keys(measuredTests).length} unit tests within budget ` +
    `(${totalCpu.toLocaleString("en-US")} cpu total), ` +
    `largest script ${largestScript.toLocaleString("en-US")} bytes`,
);
