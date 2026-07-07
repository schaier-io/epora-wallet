#!/usr/bin/env node
// Emits the check-count line that contract commit messages must carry (see
// rule 8 in CLAUDE.md): "<N> checks, 0 errors, 0 warnings". Runs a full
// `aiken check -D` and derives N the same way aiken's own TTY Summary line
// does: unit tests count once, property tests count once per iteration.
// `-D` denies warnings, so a zero exit status by itself proves both the error
// and the warning count are zero — no stderr parsing needed.
//
// Usage: node scripts/check-summary.mjs [extra aiken check args]
//   e.g. node scripts/check-summary.mjs --max-success 10000
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const passthroughArgs = process.argv.slice(2);

const maxSuccessIndex = passthroughArgs.indexOf("--max-success");
const maxSuccess =
  maxSuccessIndex === -1 ? 100 : Number(passthroughArgs[maxSuccessIndex + 1]);
if (!Number.isInteger(maxSuccess) || maxSuccess <= 0) {
  console.error("check-summary: --max-success needs a positive integer");
  process.exit(1);
}

// stdout is a pipe (not a TTY), so aiken prints the structured JSON report.
const result = spawnSync("aiken", ["check", "-D", ...passthroughArgs], {
  cwd: projectRoot,
  encoding: "utf8",
  maxBuffer: 256 * 1024 * 1024,
});

if (result.error) {
  console.error(`check-summary: failed to run aiken: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  process.stderr.write(result.stderr ?? "");
  console.error(
    "\ncheck-summary: `aiken check -D` failed — fix the errors/warnings above, then re-run.",
  );
  process.exit(result.status ?? 1);
}

const { summary } = JSON.parse(result.stdout);
if (summary.failed !== 0) {
  // -D exits non-zero on failures, so this is only a belt-and-braces guard.
  console.error(`check-summary: ${summary.failed} test(s) failed`);
  process.exit(1);
}

const checks = summary.kind.unit + summary.kind.property * maxSuccess;
console.log(`${checks} checks, 0 errors, 0 warnings`);
