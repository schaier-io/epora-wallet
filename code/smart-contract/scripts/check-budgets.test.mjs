import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("update records raw script size without treating 16 KiB as a script limit", (t) => {
  const projectRoot = mkdtempSync(join(tmpdir(), "check-budgets-"));
  t.after(() => rmSync(projectRoot, { recursive: true, force: true }));

  const scriptsDirectory = join(projectRoot, "scripts");
  const binDirectory = join(projectRoot, "bin");
  mkdirSync(scriptsDirectory);
  mkdirSync(binDirectory);

  const scriptPath = join(scriptsDirectory, "check-budgets.mjs");
  copyFileSync(
    fileURLToPath(new URL("./check-budgets.mjs", import.meta.url)),
    scriptPath,
  );

  const budgetsPath = join(projectRoot, "budgets.json");
  writeFileSync(budgetsPath, '{\n  "sentinel": true\n}\n');
  writeFileSync(
    join(projectRoot, "plutus.json"),
    JSON.stringify({
      validators: [
        {
          title: "oversized.validator",
          compiledCode: "00",
        },
      ],
    }),
  );

  const fakeAikenPath = join(binDirectory, "aiken");
  writeFileSync(
    fakeAikenPath,
    `#!/usr/bin/env node
if (process.argv[2] === "build") {
  const { writeFileSync } = require("node:fs");
  const { join } = require("node:path");
  writeFileSync(join(process.cwd(), "plutus.json"), JSON.stringify({
    validators: [{
      title: "oversized.validator",
      compiledCode: "00".repeat(16_385)
    }]
  }));
  process.exit(0);
}
const execution_units = { mem: 1, cpu: 1 };
process.stdout.write(JSON.stringify({
  modules: [{
    name: "transaction_budget_tests",
    tests: [
      { title: "fixture_shape_declared_wallet_execution_counts_match", execution_units },
      { title: "stt_only_w00__stt", execution_units },
      { title: "fixture_w01__stt", execution_units },
      { title: "fixture_w01__wallet_00", execution_units }
    ]
  }]
}));
`,
    { mode: 0o755 },
  );

  const result = spawnSync(process.execPath, [scriptPath, "--update"], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ""}`,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const recorded = JSON.parse(readFileSync(budgetsPath, "utf8"));
  assert.equal(recorded.scripts["oversized.validator"].size, 16_385);
});

test("update rejects a transaction with a missing wallet leg", (t) => {
  const projectRoot = mkdtempSync(join(tmpdir(), "check-budgets-"));
  t.after(() => rmSync(projectRoot, { recursive: true, force: true }));

  const scriptsDirectory = join(projectRoot, "scripts");
  const binDirectory = join(projectRoot, "bin");
  mkdirSync(scriptsDirectory);
  mkdirSync(binDirectory);

  const scriptPath = join(scriptsDirectory, "check-budgets.mjs");
  copyFileSync(
    fileURLToPath(new URL("./check-budgets.mjs", import.meta.url)),
    scriptPath,
  );

  const recordedBefore = '{\n  "sentinel": true\n}\n';
  const budgetsPath = join(projectRoot, "budgets.json");
  writeFileSync(budgetsPath, recordedBefore);
  writeFileSync(
    join(projectRoot, "plutus.json"),
    JSON.stringify({ validators: [] }),
  );

  const fakeAikenPath = join(binDirectory, "aiken");
  writeFileSync(
    fakeAikenPath,
    `#!/usr/bin/env node
const execution_units = { mem: 1, cpu: 1 };
process.stdout.write(JSON.stringify({
  modules: [{
    name: "transaction_budget_tests",
    tests: [
      { title: "fixture_w02__stt", execution_units },
      { title: "fixture_w02__wallet_00", execution_units }
    ]
  }]
}));
`,
    { mode: 0o755 },
  );

  const result = spawnSync(process.execPath, [scriptPath, "--update"], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ""}`,
    },
  });

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /must have one STT leg and exactly 2 wallet leg\(s\); found 1 STT and 1 wallet/,
  );
  assert.equal(readFileSync(budgetsPath, "utf8"), recordedBefore);
});
