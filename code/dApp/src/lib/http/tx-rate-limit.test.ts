import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TX_RATE_LIMIT_DEFAULTS,
  readPositiveIntEnv,
  readTxRateLimits
} from "@/lib/http/tx-rate-limit";

describe("readPositiveIntEnv", () => {
  it("takes a valid override", () => {
    assert.equal(readPositiveIntEnv("7", 5, 100), 7);
    assert.equal(readPositiveIntEnv("  7  ", 5, 100), 7);
  });

  // A typo in a deployment's environment must never widen a cap, and must
  // never take the build routes down. Both mean: fall back.
  it("falls back rather than throwing or widening", () => {
    for (const bad of [undefined, "", "   ", "abc", "0", "-3", "2.5", "1e3", "101", "Infinity", "NaN"]) {
      assert.equal(readPositiveIntEnv(bad, 5, 100), 5, `expected fallback for ${JSON.stringify(bad)}`);
    }
  });
});

describe("readTxRateLimits", () => {
  it("uses the defaults when nothing is set", () => {
    assert.deepEqual(readTxRateLimits({}), TX_RATE_LIMIT_DEFAULTS);
  });

  it("reads each cap from its own variable", () => {
    assert.deepEqual(
      readTxRateLimits({
        TX_RATE_LIMIT_REQUESTS: "3",
        TX_RATE_LIMIT_WINDOW_MS: "30000",
        TX_RATE_LIMIT_GLOBAL_REQUESTS: "12",
        TX_RATE_LIMIT_GLOBAL_WINDOW_MS: "90000"
      }),
      {
        perClientRequests: 3,
        perClientWindowMs: 30_000,
        globalRequests: 12,
        globalWindowMs: 90_000
      }
    );
  });

  it("keeps the default for the one variable that is malformed", () => {
    const limits = readTxRateLimits({
      TX_RATE_LIMIT_REQUESTS: "3",
      TX_RATE_LIMIT_GLOBAL_REQUESTS: "not-a-number"
    });

    assert.equal(limits.perClientRequests, 3);
    assert.equal(limits.globalRequests, TX_RATE_LIMIT_DEFAULTS.globalRequests);
  });

  // The per-client cap is the one a single caller can spend. It must stay
  // below the deployment cap, or the deployment cap can never bind first and
  // the backstop is decorative.
  it("defaults the per-client cap below the deployment cap", () => {
    assert.ok(
      TX_RATE_LIMIT_DEFAULTS.perClientRequests < TX_RATE_LIMIT_DEFAULTS.globalRequests,
      "per-client default must be below the deployment default"
    );
  });
});
