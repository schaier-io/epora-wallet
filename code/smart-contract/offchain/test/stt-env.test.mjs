import assert from "node:assert/strict";
import { test } from "node:test";
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
