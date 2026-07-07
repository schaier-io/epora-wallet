#!/usr/bin/env node
// Guards against toolchain drift: the local `aiken` must match the `compiler`
// version pinned in aiken.toml (which is also what every CI workflow installs).
// A different compiler produces different validator hashes — and the hash IS
// the on-chain contract address — plus potentially different formatter output,
// so a drifted toolchain can pass locally and still fail or churn CI.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const aikenToml = readFileSync(join(projectRoot, "aiken.toml"), "utf8");
const pinned = aikenToml.match(/^compiler\s*=\s*"([^"]+)"/m)?.[1];

if (!pinned) {
  console.error("check-toolchain: could not find `compiler = \"...\"` in aiken.toml");
  process.exit(1);
}

let versionOutput;
try {
  versionOutput = execFileSync("aiken", ["--version"], { encoding: "utf8" }).trim();
} catch {
  console.error(`check-toolchain: \`aiken\` not found on PATH.`);
  console.error(`Install the pinned toolchain with: aikup install ${pinned}`);
  process.exit(1);
}

// "aiken v1.1.22+39d6b04" -> "v1.1.22"
const local = versionOutput.match(/v\d+\.\d+\.\d+/)?.[0];

if (local !== pinned) {
  console.error(
    `check-toolchain: local toolchain is "${versionOutput}" but aiken.toml pins ${pinned}.`,
  );
  console.error(`Switch with: aikup install ${pinned}`);
  process.exit(1);
}

console.log(`check-toolchain: aiken ${local} matches the aiken.toml pin`);
