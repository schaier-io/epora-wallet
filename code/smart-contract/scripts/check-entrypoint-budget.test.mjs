import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("entrypoint fixture reserves room for its required vkey witness", (t) => {
  const workspace = mkdtempSync(join(tmpdir(), "entrypoint-witness-size-"));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const project = join(workspace, "smart-contract");
  const scripts = join(project, "scripts");
  const fixtures = join(project, "fixtures", "entrypoint-budget");
  const mirror = join(workspace, "dApp", "src", "lib", "contracts");
  for (const path of [scripts, fixtures, mirror]) mkdirSync(path, { recursive: true });
  const sourceRoot = fileURLToPath(new URL("../", import.meta.url));
  copyFileSync(join(sourceRoot, "scripts", "check-entrypoint-budget.mjs"), join(scripts, "check-entrypoint-budget.mjs"));
  copyFileSync(join(sourceRoot, "plutus.json"), join(project, "plutus.json"));
  copyFileSync(join(sourceRoot, "plutus.json"), join(mirror, "plutus.json"));
  const fixtureRoot = join(sourceRoot, "fixtures", "entrypoint-budget");
  const manifest = JSON.parse(readFileSync(join(fixtureRoot, "manifest.json"), "utf8"));
  const source = JSON.parse(readFileSync(join(fixtureRoot, "source.json"), "utf8"));
  // This unsigned size fits 16,384 bytes but leaves only 104 bytes for
  // the one key shared by the crank, funding input, and collateral input.
  // Conway serialization needs 106 bytes, including its three-byte set tag.
  source.transactionBytes = 16_280;
  manifest.fixture.transactionBytes = source.transactionBytes;
  writeFileSync(join(fixtures, "manifest.json"), JSON.stringify(manifest));
  writeFileSync(join(fixtures, "source.json"), JSON.stringify(source));
  const result = spawnSync(process.execPath, [join(scripts, "check-entrypoint-budget.mjs"), "--check-generated"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unsigned fixture transaction must be 16000\.\.16278 bytes/);
});
