/**
 * Logic for the repository-wide 750-line source cap (AGENTS.md,
 * "File length: hard cap 750 lines"). Split from the check-file-length.mjs
 * runner so the guard's own tests can exercise the 750/751 boundary and the
 * exclusion families against throwaway fixtures instead of the live tree.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const MAX_SOURCE_LINES = 750;

// Line counting rule: a line is a newline-terminated run of characters. A
// trailing final newline therefore does not add a phantom line ("a\n" is one
// line, not two), while a final line without a newline still counts ("a" is
// one line). Exactly 750 lines pass; 751 fail.
export function countLines(text) {
  if (text === "") return 0;
  const newlines = (text.match(/\n/g) ?? []).length;
  return text.endsWith("\n") ? newlines : newlines + 1;
}

function fileName(relPath) {
  return relPath.slice(relPath.lastIndexOf("/") + 1);
}

// --- Exclusions, one predicate per AGENTS.md exclusion family ---

// Test files: `*_tests.ak`, `*.test.ts`, `*.test.tsx`, `__tests__/**`. The
// repo also keeps plain-node script tests as `*.test.mjs`
// (scripts/lib/i18n-static-coverage.test.mjs,
// code/smart-contract/scripts/check-budgets.test.mjs), so the same family
// covers that extension too.
function isTestFile(relPath) {
  const name = fileName(relPath);
  return (
    name.endsWith("_tests.ak") ||
    name.endsWith(".test.ts") ||
    name.endsWith(".test.tsx") ||
    name.endsWith(".test.mjs") ||
    relPath.startsWith("__tests__/") ||
    relPath.includes("/__tests__/")
  );
}

// Generated files. Named in AGENTS.md: `plutus.json`, `pnpm-lock.yaml`,
// `*.d.ts` (which covers `next-env.d.ts`). Also the committed artifacts this
// repo regenerates and verifies with a --check CI guard, which fall under the
// same "generated" family:
// - code/dApp/src/i18n/generated/** (generate-default-message-catalog.mjs,
//   verified by `pnpm i18n:check`)
// - code/smart-contract/budgets.json (check-budgets.mjs snapshots Aiken unit
//   and execution budgets into it, verified by smart-contract-ci.yml)
// - docs/api/openapi.json (build-openapi.ts output from the zod schemas,
//   verified by `pnpm openapi:check` in dapp-ci.yml)
function isGeneratedFile(relPath) {
  const name = fileName(relPath);
  return (
    name === "plutus.json" ||
    name === "pnpm-lock.yaml" ||
    name.endsWith(".d.ts") ||
    relPath.startsWith("code/dApp/src/i18n/generated/") ||
    relPath === "code/smart-contract/budgets.json" ||
    relPath === "docs/api/openapi.json"
  );
}

// Binary assets are not source: AGENTS.md caps authored source files, and a
// newline count of a binary is noise. Tracked binaries today are .png/.ico
// images, the docs/assets/wallet-ui.mp4 capture, and whitepaper/whitepaper.pdf
// (which is additionally the build output of whitepaper/whitepaper.tex). A new
// binary type trips the check, then gets added here deliberately.
const BINARY_EXTENSIONS = [".png", ".ico", ".mp4", ".pdf"];

function isBinaryAsset(relPath) {
  return BINARY_EXTENSIONS.some((extension) => relPath.endsWith(extension));
}

// Vendored: unmodified third-party drop-ins. AGENTS.md names
// "react-bits component CSS like components/ProfileCard.css"; the list is
// explicit because vendored status is per-file, not per-directory. The .tsx
// files under code/dApp/src/components/react-bits/ are deliberately NOT
// listed: they are adapted to this repo (they import @/lib and next-intl), so
// they stay in scope. Add a future unmodified drop-in here, with a comment
// naming its upstream.
const VENDORED_PATHS = ["code/dApp/src/components/ProfileCard.css"];

function isVendoredFile(relPath) {
  return VENDORED_PATHS.includes(relPath);
}

// Documentation prose (.md) is outside the cap's scope. The rule exists to
// stop code files that hold several responsibilities (god files, mixed
// View/Model/logic); its watch list and remediation history are code files,
// and AGENTS.md's "No authored file is currently over the 750-line cap" audit
// only holds when prose is excluded. Restructuring long docs is writing work,
// not a CI failure here.
function isDocumentationFile(relPath) {
  return relPath.endsWith(".md");
}

export function isExcluded(relPath) {
  return (
    isTestFile(relPath) ||
    isGeneratedFile(relPath) ||
    isBinaryAsset(relPath) ||
    isVendoredFile(relPath) ||
    isDocumentationFile(relPath)
  );
}

// Walks up from `startDir` to the directory containing `.git`, so the guard
// behaves the same whether it is invoked from the repo root or from
// code/dApp. Handles the worktree case where `.git` is a file.
export function findRepoRoot(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`No repository root (no .git found above ${startDir}).`);
    }
    dir = parent;
  }
}

// The file universe is `git ls-files`: untracked and gitignored files (real
// build output, test fixtures, editor droppings) are out by construction.
export function listTrackedFiles(rootDir) {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: rootDir,
    encoding: "buffer"
  });
  return output.toString("utf8").split("\0").filter(Boolean);
}

// Counts every tracked, non-excluded file and reports the ones over the cap.
// An unreadable file throws on purpose: silently skipping it would weaken the
// guard.
export function auditFiles(rootDir) {
  let checked = 0;
  const violations = [];
  for (const relPath of listTrackedFiles(rootDir)) {
    if (isExcluded(relPath)) continue;
    checked += 1;
    const lines = countLines(fs.readFileSync(path.join(rootDir, relPath), "utf8"));
    if (lines > MAX_SOURCE_LINES) violations.push({ path: relPath, lines });
  }
  return { checked, violations: violations.toSorted((a, b) => a.path.localeCompare(b.path)) };
}
