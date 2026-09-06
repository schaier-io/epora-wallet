#!/usr/bin/env node
// Run the typed Mesh fixture in the dApp's existing dependency environment.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const dAppRoot = fileURLToPath(new URL("../../dApp/", import.meta.url));
const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "scripts/check-beneficiary-distribution-native.ts"],
  { cwd: dAppRoot, stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
