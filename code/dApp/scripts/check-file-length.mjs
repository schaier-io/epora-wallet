/**
 * Repo-wide guard for the AGENTS.md "File length: hard cap 750 lines" rule.
 *
 * Read-only: it lists tracked files, counts newline-terminated lines, prints
 * every file over the cap with its count, and exits nonzero when any exist.
 * The universe is `git ls-files`, so untracked and ignored build output is
 * out by construction; the remaining exclusions (tests, generated, binaries,
 * vendored, docs) live in lib/file-length.mjs next to the AGENTS.md rule each
 * implements.
 *
 * The repository root is resolved from this script's own location, so the
 * scan covers the whole repository whether it is invoked from the repo root
 * or from code/dApp.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditFiles, findRepoRoot, MAX_SOURCE_LINES } from "./lib/file-length.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = findRepoRoot(scriptDir);
const { checked, violations } = auditFiles(rootDir);

if (violations.length > 0) {
  for (const { path: filePath, lines } of violations) {
    console.error(`${filePath}: ${lines} lines exceeds the ${MAX_SOURCE_LINES}-line source cap.`);
  }
  console.error(
    `${violations.length} of ${checked} checked files exceed the ${MAX_SOURCE_LINES}-line cap.`
  );
  process.exitCode = 1;
} else {
  console.log(`File length OK: ${checked} source files checked, none over ${MAX_SOURCE_LINES} lines.`);
}
