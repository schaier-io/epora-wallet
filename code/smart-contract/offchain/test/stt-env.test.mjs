import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { sttIdentifiersFromEnv } from "../lib/stt-env.mjs";

const VALID_POLICY_ID = "ab".repeat(28);
const VALID_ASSET_NAME = "cd".repeat(32);

test("valid STT identifiers are normalized", () => {
  assert.deepEqual(
    sttIdentifiersFromEnv({
      STT_POLICY_ID: VALID_POLICY_ID.toUpperCase(),
      STT_ASSET_NAME: VALID_ASSET_NAME.toUpperCase(),
    }),
    {
      sttPolicyId: VALID_POLICY_ID,
      sttAssetName: VALID_ASSET_NAME,
    },
  );
});

test("missing STT identifiers are rejected", () => {
  assert.throws(
    () => sttIdentifiersFromEnv({ STT_ASSET_NAME: VALID_ASSET_NAME }),
    /STT_POLICY_ID must be exactly 56 hexadecimal characters/,
  );
  assert.throws(
    () => sttIdentifiersFromEnv({ STT_POLICY_ID: VALID_POLICY_ID }),
    /STT_ASSET_NAME must be exactly 64 hexadecimal characters/,
  );
});

test("malformed STT identifiers are rejected", () => {
  assert.throws(
    () =>
      sttIdentifiersFromEnv({
        STT_POLICY_ID: "g".repeat(56),
        STT_ASSET_NAME: VALID_ASSET_NAME,
      }),
    /STT_POLICY_ID must be exactly 56 hexadecimal characters/,
  );
  assert.throws(
    () =>
      sttIdentifiersFromEnv({
        STT_POLICY_ID: VALID_POLICY_ID,
        STT_ASSET_NAME: "00",
      }),
    /STT_ASSET_NAME must be exactly 64 hexadecimal characters/,
  );
});
test("funding script rejects missing STT identity before provider or key access", (t) => {
  const workingDirectory = mkdtempSync(join(tmpdir(), "fund-wallet-stt-env-"));
  t.after(() => rmSync(workingDirectory, { recursive: true, force: true }));

  const env = { ...process.env };
  delete env.STT_POLICY_ID;
  delete env.STT_ASSET_NAME;
  delete env.BLOCKFROST_API_KEY;
  delete env.CARDANO_PROVIDER_URL;

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("../fund-wallet-example.mjs", import.meta.url))],
    {
      cwd: workingDirectory,
      encoding: "utf8",
      env,
    },
  );

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /STT_POLICY_ID must be exactly 56 hexadecimal characters/,
  );
  assert.doesNotMatch(result.stderr, /Missing BLOCKFROST_API_KEY/);
  assert.doesNotMatch(result.stderr, /wallet_1\.sk|ENOENT/);
  assert.equal(result.stdout, "");
});
