import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const script = join(dirname(fileURLToPath(import.meta.url)), "..", "generate-credentials.mjs");

test("generated mnemonic files are owner-only", () => {
  const directory = mkdtempSync(join(tmpdir(), "epora-credentials-"));
  try {
    const result = spawnSync(process.execPath, [script], {
      cwd: directory,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(statSync(join(directory, "wallet_1.sk")).mode & 0o777, 0o600);
    assert.equal(statSync(join(directory, "wallet_2.sk")).mode & 0o777, 0o600);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
