#!/usr/bin/env node
// Guards against banned-vocabulary drift: the canonical contract vocabulary
// (CLAUDE.md §6) forbids legacy terms in code, identifiers, comments, and docs.
// This gate greps the source tree for the terms that have historically kept
// re-seeding themselves via copy-paste. CLAUDE.md itself is excluded — its §6
// table intentionally quotes every banned word as part of the ban.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// Pattern -> canonical replacement (shown in the error message).
const BANNED = [
  [/proof[-_ ]of[-_ ]live\b/i, "proof-of-life"],
  [/\bheirs?\b/i, "beneficiary"],
  [/\brecipients?\b/i, "beneficiary (recovery role) or payee (streaming payments)"],
  [/\bsubscriptions?\b/i, "streaming payment"],
  [/\bWalletWitness\b/, "SttAction"],
  [/\bstate[-_ ]token\b/i, "STT (state thread token)"],
  [/\bbeacon\b/i, "STT (state thread token)"],
];

const SCAN_DIRS = ["lib", "validators", "offchain", "scripts"];
const SCAN_FILES = ["README.md", "INTERACTIONS.md"];
const SCAN_EXT = new Set([".ak", ".mjs", ".md"]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

const targets = [];
for (const d of SCAN_DIRS) targets.push(...walk(join(projectRoot, d)));
for (const f of SCAN_FILES) targets.push(join(projectRoot, f));

let hits = 0;
for (const file of targets) {
  if (![...SCAN_EXT].some((ext) => file.endsWith(ext))) continue;
  // This gate lists the banned spellings, so it must not flag itself.
  if (file.endsWith("check-vocabulary.mjs")) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const [pattern, canonical] of BANNED) {
      if (pattern.test(line)) {
        hits++;
        console.error(
          `${relative(projectRoot, file)}:${i + 1}: banned term ${pattern} (use "${canonical}")`,
        );
      }
    }
  });
}

if (hits > 0) {
  console.error(
    `check-vocabulary: ${hits} banned-term hit(s) — see CLAUDE.md §6 for the canonical vocabulary.`,
  );
  process.exit(1);
}
console.log("check-vocabulary: OK — no banned vocabulary in lib/, validators/, offchain/, scripts/, README, INTERACTIONS.");
