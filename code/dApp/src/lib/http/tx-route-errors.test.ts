import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import {
  BUILD_FAILED_MESSAGE,
  PROVIDER_UNAVAILABLE_MESSAGE,
  classifyBuildFailure,
  describeZodIssue
} from "@/lib/http/tx-route-errors";
import { createStageError } from "@/lib/mesh/transactions/internals";

describe("classifyBuildFailure", () => {
  it("treats a plain builder Error as the caller's mistake and returns its message", () => {
    const failure = classifyBuildFailure(new Error("Wallet script parameters are missing."));

    assert.equal(failure.status, 400);
    assert.equal(failure.message, "Wallet script parameters are missing.");
    assert.equal(failure.severity, "info");
  });

  it("returns a staged builder error as 400 and keeps the stage for the log", () => {
    const failure = classifyBuildFailure(
      createStageError(
        "setup:manualCollateral",
        new Error("No suitable ADA-only wallet UTxO found for manual script collateral.")
      )
    );

    assert.equal(failure.status, 400);
    assert.equal(failure.stage, "setup:manualCollateral");
    assert.match(failure.message, /manual script collateral/);
  });

  it("answers 502 for a provider failure and leaks none of its text", () => {
    const providerError = createStageError(
      "mint:referenceUtxo",
      new Error("Blockfrost request to https://cardano-preprod.blockfrost.io failed: 503")
    );
    const failure = classifyBuildFailure(providerError);

    assert.equal(failure.status, 502);
    assert.equal(failure.message, PROVIDER_UNAVAILABLE_MESSAGE);
    assert.equal(failure.severity, "error");
    assert.doesNotMatch(failure.message, /blockfrost|503|https/i);
  });

  it("detects a transport failure buried in the cause chain", () => {
    const failure = classifyBuildFailure(
      createStageError("stt-spend:fetchSttUtxos", new Error("connect ECONNREFUSED 127.0.0.1:443"))
    );

    assert.equal(failure.status, 502);
    assert.equal(failure.message, PROVIDER_UNAVAILABLE_MESSAGE);
  });

  it("falls back to 500 for something that is not an Error at all", () => {
    const failure = classifyBuildFailure("kaboom");

    assert.equal(failure.status, 500);
    assert.equal(failure.message, BUILD_FAILED_MESSAGE);
    assert.equal(failure.severity, "error");
  });
});

describe("describeZodIssue", () => {
  const schema = z.object({
    address: z.string(),
    mintLovelace: z.string().regex(/^\d+$/, "Expected a non-negative integer amount, as a string.")
  });

  it("names the field that failed", () => {
    const result = schema.safeParse({ address: "addr_test1x", mintLovelace: "abc" });
    assert.equal(result.success, false);
    assert.equal(
      describeZodIssue(result.error),
      "mintLovelace: Expected a non-negative integer amount, as a string."
    );
  });

  it("uses the bare message when the issue has no path", () => {
    const result = z.string().safeParse(42);
    assert.equal(result.success, false);
    assert.equal(describeZodIssue(result.error), "Invalid input: expected string, received number");
  });
});
