import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { auditFiles, countLines, findRepoRoot, isExcluded, MAX_SOURCE_LINES } from "./file-length.mjs";

// Fixtures are generated at test time in a temp directory, never tracked, so
// the repo-wide check never trips on its own test fixtures.
const lines = (count) => Array.from({ length: count }, (_, index) => `line ${index + 1}`).join("\n") + "\n";

const tempRepos = [];
test.after(() => {
  for (const root of tempRepos.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function makeTempRepo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "file-length-"));
  tempRepos.push(root);
  for (const [relPath, content] of Object.entries(files)) {
    const abs = path.join(root, relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  return root;
}

// Installs a copy of the real runner next to its lib so the exit-code tests
// exercise the actual script (the runner resolves the repo root from its own
// location, so it must live inside the fixture repo).
function installRunner(root) {
  const runner = new URL("../check-file-length.mjs", import.meta.url);
  const lib = new URL("./file-length.mjs", import.meta.url);
  fs.mkdirSync(path.join(root, "scripts", "lib"), { recursive: true });
  fs.copyFileSync(runner, path.join(root, "scripts", "check-file-length.mjs"));
  fs.copyFileSync(lib, path.join(root, "scripts", "lib", "file-length.mjs"));
}

test("counts newline-terminated lines without double-counting the trailing newline", () => {
  assert.equal(countLines(""), 0);
  assert.equal(countLines("a\nb\nc\n"), 3);
  assert.equal(countLines("a\nb\nc"), 3);
  assert.equal(countLines(lines(MAX_SOURCE_LINES)), MAX_SOURCE_LINES);
});

test("exactly 750 lines passes and 751 fails", () => {
  const root = makeTempRepo({
    "boundary/at-limit.ts": lines(MAX_SOURCE_LINES),
    "boundary/over-limit.ts": lines(MAX_SOURCE_LINES + 1)
  });
  const { checked, violations } = auditFiles(root);
  assert.equal(checked, 2);
  assert.deepEqual(
    violations.map(({ path, lines }) => ({ path, lines })),
    [{ path: "boundary/over-limit.ts", lines: MAX_SOURCE_LINES + 1 }]
  );
});

test("every exclusion family stays out of the audit", () => {
  const root = makeTempRepo({
    "validators/transaction_budget_tests.ak": lines(2000),
    "src/components/payee-view.test.tsx": lines(2000),
    "src/lib/state-validation.test.ts": lines(2000),
    "scripts/lib/other-guard.test.mjs": lines(2000),
    "src/payee/__tests__/amounts.ts": lines(2000),
    "code/smart-contract/plutus.json": lines(2000),
    "code/dApp/pnpm-lock.yaml": lines(2000),
    "src/i18n/types.d.ts": lines(2000),
    "code/dApp/src/i18n/generated/default-en/AppManifest.json": lines(2000),
    "code/smart-contract/budgets.json": lines(2000),
    "docs/api/openapi.json": lines(2000),
    "docs/assets/wallet-ui.mp4": "binary noise\n",
    "whitepaper/whitepaper.pdf": "binary noise\n",
    "src/app/favicon.ico": "binary noise\n",
    "src/app/apple-icon.png": "binary noise\n"
  });
  const { checked, violations } = auditFiles(root);
  assert.equal(checked, 0);
  assert.deepEqual(violations, []);
});

test("the vendored list is excluded but adapted react-bits files stay in scope", () => {
  assert.equal(isExcluded("code/dApp/src/components/ProfileCard.css"), true);
  assert.equal(isExcluded("code/dApp/src/components/react-bits/silk-waves.tsx"), false);
  assert.equal(isExcluded("code/dApp/src/components/react-bits/primitives.tsx"), false);
});

test("documentation prose is out of scope while authored source stays in", () => {
  for (const relPath of ["README.md", "docs/api/README.md", "code/smart-contract/CLAUDE.md"]) {
    assert.equal(isExcluded(relPath), true, relPath);
  }
  for (const relPath of [
    "code/dApp/src/app/globals.css",
    "code/smart-contract/validators/wallet_spend.ak",
    "whitepaper/whitepaper.tex",
    ".github/workflows/file-length.yml",
    "code/dApp/scripts/check-file-length.mjs"
  ]) {
    assert.equal(isExcluded(relPath), false, relPath);
  }
});

test("findRepoRoot walks up from a nested directory and fails outside a repository", () => {
  const root = makeTempRepo({ "nested/deep/fixture.ts": "x\n" });
  assert.equal(findRepoRoot(path.join(root, "nested", "deep")), root);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "file-length-"));
  assert.throws(() => findRepoRoot(outside), /No repository root/);
});

test("the runner exits 1 and reports an included 751-line fixture", () => {
  const root = makeTempRepo({ "boundary/over-limit.ts": lines(MAX_SOURCE_LINES + 1) });
  installRunner(root);
  const run = spawnSync(process.execPath, ["scripts/check-file-length.mjs"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /boundary\/over-limit\.ts: 751 lines exceeds the 750-line source cap\./);
});

test("the runner exits 0 from a nested cwd with only in-cap files", () => {
  const root = makeTempRepo({ "src/under-limit.ts": lines(MAX_SOURCE_LINES) });
  installRunner(root);
  const run = spawnSync(process.execPath, [path.join(root, "scripts", "check-file-length.mjs")], {
    // A cwd deep inside the fixture repo proves the root comes from the
    // script's own location, not from where it is invoked.
    cwd: path.join(root, "src"),
    encoding: "utf8"
  });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /File length OK: 1 source files checked/);
});
