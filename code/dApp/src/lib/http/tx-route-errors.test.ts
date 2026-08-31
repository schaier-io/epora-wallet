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
      new Error("Request failed with status code 503 for https://cardano-preprod.blockfrost.io")
    );
    const failure = classifyBuildFailure(providerError);

    assert.equal(failure.status, 502);
    assert.equal(failure.message, PROVIDER_UNAVAILABLE_MESSAGE);
    assert.equal(failure.severity, "error");
    assert.doesNotMatch(failure.message, /blockfrost|503|https/i);
  });

  // Measured against a live preprod build: every staged builder error carries
  // setup diagnostics that name the provider, so a classifier that searched the
  // whole error graph reported ordinary caller mistakes as provider outages.
  it("does not mistake a caller's mistake for an outage because diagnostics name the provider", () => {
    const failure = classifyBuildFailure(
      createStageError(
        "wallet-vote:tx.draft-build",
        new Error("Error serializing votes: Cannot read properties of undefined (reading 'type')"),
        {
          evaluatorSource: "blockfrost-via-server-route",
          protocolParametersSource: "blockfrost-epochs-latest-parameters"
        }
      )
    );

    assert.equal(failure.status, 400);
    assert.match(failure.message, /serializing votes/);
  });

  it("ignores markers that appear only in a stack trace, not in a message", () => {
    const error = new Error("Forwarded STT state datum is invalid.");
    error.stack = `${error.stack ?? ""}\n    at fetchFailed (/app/node_modules/network-error/index.js:1:1)`;

    assert.equal(classifyBuildFailure(error).status, 400);
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

  it("bounds a runaway builder message so the response stays a sane size", () => {
    const failure = classifyBuildFailure(
      new Error(`Evaluate redeemers failed. For txHex: ${"84ab00".repeat(4000)}`)
    );

    assert.equal(failure.status, 400);
    assert.ok(failure.message.length < 600, `message was ${failure.message.length} chars`);
    assert.match(failure.message, /^Evaluate redeemers failed/);
    assert.match(failure.message, /\.\.\.$/);
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

  // A deep path or a wide union can make zod's own message long. The docs
  // promise every build failure answers within one bound, so this one is
  // bounded too, not only the builder's.
  it("bounds a long message like every other error body", () => {
    const error = new z.ZodError([
      {
        code: "custom",
        path: ["config", "sttAssetNameHex"],
        message: "x".repeat(900)
      }
    ]);

    const described = describeZodIssue(error);

    assert.ok(described.startsWith("config.sttAssetNameHex: "));
    assert.ok(described.length <= 503, `expected at most 503 characters, got ${described.length}`);
    assert.ok(described.endsWith("..."));
  });
});
