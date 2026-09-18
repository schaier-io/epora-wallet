import assert from "node:assert/strict";
import test from "node:test";
import { isWorkspaceBuildResultExpired, warmBuildResultExpiry } from "./workspace-build-expiry";
import type { BuildResult } from "@/lib/types/contracts";

// Same minimal transaction layout as workspace-build-cache.test.ts; TTL is configurable.
function preview(ttlHex: string): BuildResult {
  return {
    txHex: `84a40081825820${"aa".repeat(32)}00018182581d60${"bb".repeat(28)}1a004c4b40021a00030d40031a${ttlHex}a0f5f6`,
    preview: { action: "mint", summary: "Test transaction" }
  } as BuildResult;
}

test("a transaction whose TTL slot already passed is expired", async () => {
  // Preprod slot 100 began in September 2022 (1655683300000 ms).
  const expired = preview("00000064");
  await warmBuildResultExpiry(expired);
  assert.equal(isWorkspaceBuildResultExpired(expired), true);
});

test("a far-future TTL, a missing TTL, and an unparseable tx are not expired", async () => {
  const future = preview("77359400");
  await warmBuildResultExpiry(future);
  assert.equal(isWorkspaceBuildResultExpired(future), false);

  const withoutTtl = preview("00000064").txHex.replace("84a4", "84a3").replace("031a00000064", "");
  const unbounded = { preview: {} as never, txHex: withoutTtl } as BuildResult;
  await warmBuildResultExpiry(unbounded);
  assert.equal(isWorkspaceBuildResultExpired(unbounded), false);

  const malformed = { preview: {} as never, txHex: "malformed" } as BuildResult;
  await warmBuildResultExpiry(malformed);
  assert.equal(isWorkspaceBuildResultExpired(malformed), false);
});

test("a result that never went through a build completion reads as unbounded", () => {
  assert.equal(isWorkspaceBuildResultExpired(preview("00000064")), false);
});
