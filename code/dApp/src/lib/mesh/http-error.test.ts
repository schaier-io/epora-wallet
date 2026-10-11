import assert from "node:assert/strict";
import test from "node:test";
import {
  isLedgerSubmitRejection,
  isScriptEvaluationRejection,
  meshHttpRetryAfter,
  meshHttpStatus,
  meshUpstreamFailure,
  UPSTREAM_RETRY_AFTER_FALLBACK_SECONDS
} from "./http-error";

test("HTTP metadata survives Mesh's nested JSON encoding", () => {
  const error = JSON.stringify(JSON.stringify({ status: 429, headers: { "Retry-After": "20" } }));
  assert.equal(meshHttpStatus(error), 429);
  assert.equal(meshHttpRetryAfter(error), "20");
});

test("HTTP metadata also supports typed errors and rejects invalid status values", () => {
  assert.equal(meshHttpStatus(Object.assign(new Error("invalid upstream payload"), { status: 502 })), 502);
  for (const status of [undefined, "502", 0, 200, 600, Infinity]) {
    assert.equal(meshHttpStatus({ status }), null);
  }
});

test("only a valid retry header leaves the provider boundary", () => {
  for (const value of ["", "garbage", "-1", "10\r\nOther: value", {}, Infinity]) {
    assert.equal(meshHttpRetryAfter({ headers: { "retry-after": value } }), null);
  }
  assert.equal(meshHttpRetryAfter({ headers: { "retry-after": "Wed, 21 Oct 2015 07:28:00 GMT" } }), "Wed, 21 Oct 2015 07:28:00 GMT");
});

test("a ScriptFailures map marks a caller-side rejection, other failure kinds do not", () => {
  const body = (failure: unknown) => JSON.stringify(JSON.stringify({
    type: "jsonwsp/response",
    methodname: "EvaluateTx",
    result: { EvaluationFailure: failure }
  }));
  assert.equal(isScriptEvaluationRejection(body({ ScriptFailures: {} })), true);
  assert.equal(isScriptEvaluationRejection(body({ ScriptFailures: { "spend:0": ["boom"] } })), true);
  assert.equal(isScriptEvaluationRejection(new Error(body({ ScriptFailures: {} }))), true);
  assert.equal(isScriptEvaluationRejection(body({ CannotCreateEvaluationContext: { reason: "x" } })), false);
  assert.equal(isScriptEvaluationRejection(body({ ScriptFailures: "{}" })), false);
  assert.equal(isScriptEvaluationRejection(JSON.stringify({ status: 500 })), false);
  assert.equal(isScriptEvaluationRejection("not json"), false);
});

// The Blockfrost submit answer from Sentry EPORA-WALLET-G, trimmed to the fields read.
const votersDoNotExist = JSON.stringify({
  data: {
    error: "Bad Request",
    message: JSON.stringify({
      contents: { contents: { contents: {
        era: "ShelleyBasedEraConway",
        error: ["ConwayGovFailure (VotersDoNotExist (DRepVoter (ScriptHashObj (ScriptHash \"33c6203ecc59890e048af189778557fff6e6ed82ba0d8d38db5123f2\")) :| []))"],
        kind: "ShelleyTxValidationError"
      }, tag: "TxValidationErrorInCardanoMode" }, tag: "TxCmdTxSubmitValidationError" },
      tag: "TxSubmitFail"
    }),
    status_code: 400
  },
  headers: {},
  status: 400
});

test("a TxSubmitFail 400 marks a caller-side ledger rejection, other submit failures do not", () => {
  assert.equal(isLedgerSubmitRejection(votersDoNotExist), true);
  assert.equal(isLedgerSubmitRejection(new Error(votersDoNotExist)), true);
  const withBody = (status: number, message: unknown) => JSON.stringify({ data: { message }, status });
  assert.equal(isLedgerSubmitRejection(withBody(500, JSON.stringify({ tag: "TxSubmitFail" }))), false);
  assert.equal(isLedgerSubmitRejection(withBody(400, JSON.stringify({ tag: "Other" }))), false);
  assert.equal(isLedgerSubmitRejection(withBody(400, "Bad Request")), false);
  assert.equal(isLedgerSubmitRejection(JSON.stringify({ status: 400 })), false);
  assert.equal(isLedgerSubmitRejection("not json"), false);
});

test("an upstream 429 stays a 429 whose Retry-After is always in seconds", () => {
  const limited = (headers: Record<string, string>) => JSON.stringify({ status: 429, headers });
  assert.deepEqual(meshUpstreamFailure(limited({ "Retry-After": "20" })), { status: 429, retryAfterSeconds: "20" });
  const inNinetySeconds = new Date(Date.now() + 90_000).toUTCString();
  const fromDate = meshUpstreamFailure(limited({ "retry-after": inNinetySeconds }));
  assert.equal(fromDate?.status, 429);
  assert.ok(fromDate?.status === 429 && Number(fromDate.retryAfterSeconds) >= 88 && Number(fromDate.retryAfterSeconds) <= 90);
  assert.deepEqual(meshUpstreamFailure(limited({})), {
    status: 429,
    retryAfterSeconds: String(UPSTREAM_RETRY_AFTER_FALLBACK_SECONDS)
  });
});

test("an upstream 5xx is a 502, and anything else is left to the route", () => {
  for (const status of [500, 502, 503, 504]) {
    assert.deepEqual(meshUpstreamFailure(JSON.stringify({ status, headers: {} })), { status: 502 });
  }
  for (const error of [JSON.stringify({ status: 400 }), JSON.stringify({ status: 404 }), new TypeError("boom")]) {
    assert.equal(meshUpstreamFailure(error), null);
  }
});
