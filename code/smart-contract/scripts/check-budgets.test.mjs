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

test("update rejects a script above 16 KiB before writing the snapshot", (t) => {
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
    JSON.stringify({
      validators: [
        {
          title: "oversized.validator",
          compiledCode: "00".repeat(16_385),
        },
      ],
    }),
  );

  const fakeAikenPath = join(binDirectory, "aiken");
  writeFileSync(
    fakeAikenPath,
    '#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ modules: [] }));\n',
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
    /script oversized\.validator size exceeds ledger maximum: 16385 > 16384/,
  );
  assert.equal(readFileSync(budgetsPath, "utf8"), recordedBefore);
});
