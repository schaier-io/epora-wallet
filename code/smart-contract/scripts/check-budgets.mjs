#!/usr/bin/env node
// Execution-cost regression gate.
//
// `aiken check` already measures what every unit test costs to evaluate
// (`execution_units.{mem,cpu}` in its JSON report) and `plutus.json` already
// records how large every compiled validator is. Transaction-budget tests use
// one test per Epora script execution, then this script groups and sums those
// named legs. An arbitrary external validator can add more cost to the same
// transaction. It is outside these fixtures and can make that transaction fail.
//
// This script snapshots both into `budgets.json`, fails when they move, and
// enforces conservative repository CI ceilings. Snapshot drift can be accepted
// deliberately. Crossing a CI ceiling cannot.
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
// These are repository CI ceilings, not live Cardano protocol parameters.
// CI stays offline. Release checks must also read the target network's current
// protocol parameters. The lower CPU ceiling keeps explicit regression margin.
const CI_TX_MEMORY_CEILING = 14_000_000;
const CI_TX_CPU_CEILING = 9_000_000_000;
const TRANSACTION_TEST_MODULE = "transaction_budget_tests";
const TRANSACTION_FIXTURE_SHAPE_TEST =
  "fixture_shape_declared_wallet_execution_counts_match";
const TRANSACTION_LEG =
  /^(?<scenario>[a-z0-9_]+)_w(?<walletCount>\d{2})__(?<script>stt|wallet)(?:_(?<index>\d{2}))?$/;
const SCRIPT_TITLE_BY_LEG = {
  stt: "stt.stt.spend",
  wallet: "wallet.wallet.spend",
};

function fail(message) {
  console.error(`check-budgets: ${message}`);
  process.exit(1);
}

// --- measure -----------------------------------------------------------------

// Rebuild first. Reading a committed blueprint can otherwise report stale
// compiled sizes after a source change.
const buildResult = spawnSync("aiken", ["build"], {
  cwd: projectRoot,
  encoding: "utf8",
  maxBuffer: 256 * 1024 * 1024,
});

if (buildResult.error) fail(`failed to build validators: ${buildResult.error.message}`);
if (buildResult.status !== 0) {
  process.stderr.write(buildResult.stderr ?? "");
  fail("`aiken build` failed. Fix that first, then re-run.");
}

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
/** transaction scenario -> named Epora units, leg count, and per-script totals. */
const measuredTransactions = {};
const transactionWalletIndexes = {};
const transactionExpectedWalletCounts = {};
for (const module of report.modules) {
  for (const test of module.tests) {
    if (!test.execution_units) continue; // property test
    measuredTests[`${module.name}.${test.title}`] = {
      mem: test.execution_units.mem,
      cpu: test.execution_units.cpu,
    };

    if (module.name !== TRANSACTION_TEST_MODULE) continue;
    if (test.title === TRANSACTION_FIXTURE_SHAPE_TEST) continue;
    const match = test.title.match(TRANSACTION_LEG);
    if (!match) {
      fail(
        `invalid transaction-budget test name ${test.title}; expected scenario_wNN__stt or scenario_wNN__wallet_NN`,
      );
    }

    const { scenario, walletCount, script, index } = match.groups;
    if ((script === "stt") !== (index === undefined)) {
      fail(`invalid transaction-budget script leg ${test.title}`);
    }

    const scenarioName = `${module.name}.${scenario}`;
    const expectedWalletCount = Number(walletCount);
    const declaredWalletCount = transactionExpectedWalletCounts[scenarioName];
    if (
      declaredWalletCount !== undefined &&
      declaredWalletCount !== expectedWalletCount
    ) {
      fail(`transaction ${scenarioName} declares conflicting wallet-leg counts`);
    }
    transactionExpectedWalletCounts[scenarioName] = expectedWalletCount;
    const scriptTitle = SCRIPT_TITLE_BY_LEG[script];
    const transaction = (measuredTransactions[scenarioName] ??= {
      mem: 0,
      cpu: 0,
      legs: 0,
      scripts: {},
    });
    const scriptTotal = (transaction.scripts[scriptTitle] ??= {
      mem: 0,
      cpu: 0,
      executions: 0,
    });

    transaction.mem += test.execution_units.mem;
    transaction.cpu += test.execution_units.cpu;
    transaction.legs += 1;
    scriptTotal.mem += test.execution_units.mem;
    scriptTotal.cpu += test.execution_units.cpu;
    scriptTotal.executions += 1;

    if (script === "wallet") {
      (transactionWalletIndexes[scenarioName] ??= []).push(Number(index));
    }
  }
}

if (Object.keys(measuredTransactions).length === 0) {
  fail(`no transaction scenarios found in ${TRANSACTION_TEST_MODULE}`);
}

for (const [name, transaction] of Object.entries(measuredTransactions)) {
  const sttExecutions =
    transaction.scripts[SCRIPT_TITLE_BY_LEG.stt]?.executions ?? 0;
  const walletExecutions =
    transaction.scripts[SCRIPT_TITLE_BY_LEG.wallet]?.executions ?? 0;
  const expectedWalletExecutions = transactionExpectedWalletCounts[name];
  if (
    sttExecutions !== 1 ||
    walletExecutions !== expectedWalletExecutions
  ) {
    fail(
      `transaction ${name} must have one STT leg and exactly ${expectedWalletExecutions} wallet leg(s); found ${sttExecutions} STT and ${walletExecutions} wallet`,
    );
  }

  const indexes = (transactionWalletIndexes[name] ?? []).sort((a, b) => a - b);
  if (indexes.some((index, position) => index !== position)) {
    fail(`transaction ${name} wallet legs must be contiguous from wallet_00`);
  }
}

/** validator title -> {size} in bytes (the compiledCode hex string / 2). */
const measuredScripts = {};
const blueprint = JSON.parse(readFileSync(blueprintPath, "utf8"));
for (const validator of blueprint.validators) {
  if (!validator.compiledCode) continue;
  measuredScripts[validator.title] = { size: validator.compiledCode.length / 2 };
}

const ceilingProblems = [];
for (const [kind, entries] of [
  ["test", measuredTests],
  ["transaction", measuredTransactions],
]) {
  for (const [name, units] of Object.entries(entries)) {
    if (units.mem > CI_TX_MEMORY_CEILING) {
      ceilingProblems.push(
        `${kind} ${name} mem exceeds CI ceiling: ${units.mem} > ${CI_TX_MEMORY_CEILING}`,
      );
    }
    if (units.cpu > CI_TX_CPU_CEILING) {
      ceilingProblems.push(
        `${kind} ${name} cpu exceeds CI ceiling: ${units.cpu} > ${CI_TX_CPU_CEILING}`,
      );
    }
  }
}
if (ceilingProblems.length > 0) {
  console.error("check-budgets: CI execution ceiling exceeded\n");
  for (const problem of ceilingProblems) console.error(`  ${problem}`);
  process.exit(1);
}

// --- record ------------------------------------------------------------------

if (update) {
  const measured = {
    tests: measuredTests,
    transactions: measuredTransactions,
    scripts: measuredScripts,
  };
  writeFileSync(budgetsPath, `${JSON.stringify(measured, null, 2)}\n`);
  const testCount = Object.keys(measuredTests).length;
  const transactionCount = Object.keys(measuredTransactions).length;
  const scriptCount = Object.keys(measuredScripts).length;
  console.log(
    `check-budgets: recorded ${testCount} unit tests, ${transactionCount} transactions, and ${scriptCount} scripts into budgets.json`,
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

function compareExact(kind, recordedEntries, measuredEntries, metric) {
  for (const name of Object.keys(recordedEntries)) {
    if (!(name in measuredEntries)) continue;
    const before = recordedEntries[name][metric];
    const after = measuredEntries[name][metric];
    if (before !== after) {
      problems.push(`${kind} ${name} ${metric}: ${before} -> ${after}`);
    }
  }
}

compare("test", recorded.tests ?? {}, measuredTests, ["mem", "cpu"]);
compare("transaction", recorded.transactions ?? {}, measuredTransactions, [
  "mem",
  "cpu",
]);
compareExact(
  "transaction",
  recorded.transactions ?? {},
  measuredTransactions,
  "legs",
);
for (const name of Object.keys(measuredTransactions)) {
  const recordedTransaction = recorded.transactions?.[name];
  if (!recordedTransaction) continue;
  compare(
    `transaction ${name} script`,
    recordedTransaction.scripts ?? {},
    measuredTransactions[name].scripts,
    ["mem", "cpu"],
  );
  compareExact(
    `transaction ${name} script`,
    recordedTransaction.scripts ?? {},
    measuredTransactions[name].scripts,
    "executions",
  );
}
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

const largestScript = Math.max(
  ...Object.values(measuredScripts).map((s) => s.size),
);
const transactionEntries = Object.entries(measuredTransactions);
const [largestMemoryName, largestMemoryTransaction] = transactionEntries.reduce(
  (largest, entry) => (entry[1].mem > largest[1].mem ? entry : largest),
);
const [largestCpuName, largestCpuTransaction] = transactionEntries.reduce(
  (largest, entry) => (entry[1].cpu > largest[1].cpu ? entry : largest),
);
console.log(
  `check-budgets: ${Object.keys(measuredTests).length} unit tests match, ` +
    `${Object.keys(measuredTransactions).length} validator groups within CI ceilings, ` +
    `largest memory ${largestMemoryName} ` +
    `(${largestMemoryTransaction.mem.toLocaleString("en-US")}), ` +
    `largest CPU ${largestCpuName} ` +
    `(${largestCpuTransaction.cpu.toLocaleString("en-US")}), ` +
    `largest raw script ${largestScript.toLocaleString("en-US")} bytes`,
);
