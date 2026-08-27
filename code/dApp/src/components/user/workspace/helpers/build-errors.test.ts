import { test } from "node:test";
import assert from "node:assert/strict";
import { formatBuildError } from "./build-errors";
import { type ErrorContext } from "@/components/user/workspace/types";

const BASE_CONTEXT: ErrorContext = {
  action: "use-allowance",
  wallet: "wallet-1",
  networkId: 0,
  context: {}
};

function parse(error: unknown, context: ErrorContext = BASE_CONTEXT) {
  return formatBuildError(error, context);
}

test("maps 'Maximum Input Count Exceeded' to the tx-too-large guidance", () => {
  const { message } = parse(new Error("Maximum Input Count Exceeded during build"));
  assert.match(message, /too large for one Cardano transaction/);
});

test("maps a missing shared STT reference to deploy guidance", () => {
  const { message } = parse(
    new Error("No shared STT reference script is deployed for the current validator")
  );
  assert.match(message, /one-time transaction setup/);
});

test("maps PPViewHashesDontMatch to the retry guidance", () => {
  const { message } = parse(new Error("Ledger error: PPViewHashesDontMatch (...)"));
  assert.match(message, /Network settings changed/);
});

test("maps missing ADA-only collateral to the collateral guidance", () => {
  const { message } = parse(
    new Error("No suitable ADA-only wallet UTxO found for manual script collateral")
  );
  assert.match(message, /ADA-only entry with at least 5 ADA/);
});

test("maps BabbageOutputTooSmallUTxO to the min-lovelace guidance", () => {
  const { message } = parse(new Error("BabbageOutputTooSmallUTxO detected"));
  assert.match(message, /needs more ADA/);
});

test("maps an EvaluationFailure with an empty ScriptFailures map to the rejection guidance", () => {
  // Doubly JSON-escaped shape the comment in the source describes.
  const { message } = parse(
    new Error('EvaluationFailure: {\\"ScriptFailures\\": {}}')
  );
  assert.match(message, /on-chain rules rejected this action/);
});

test("hides unmatched staged errors behind actionable guidance", () => {
  const { message, details } = parse(new Error("[prepare-inputs] some unexpected failure"));
  assert.match(message, /Could not build this transaction/);
  assert.match(details, /some unexpected failure/);
});

test("walks nested causes/details to find a matching message", () => {
  const inner = new Error("BabbageOutputTooSmallUTxO");
  const outer = new Error("build failed");
  (outer as { cause?: unknown }).cause = inner;
  const { message } = parse(outer);
  assert.match(message, /needs more ADA/);
});

test("keeps unmatched raw errors only in technical details", () => {
  const { message, details } = parse(new Error("totally novel failure"));
  assert.match(message, /Could not build this transaction/);
  assert.match(details, /totally novel failure/);
});

test("uses the default fallback text for non-Error inputs with no message", () => {
  const { message } = parse({ some: "object" });
  assert.match(message, /Could not build this transaction/);
});

test("rewrites an unknown missing-input ref with the generic UTxO-set message", () => {
  const ref = `${"ab".repeat(32)}#3`;
  const { message } = parse(
    new Error(`Unknown transaction input (missing from UTxO set): ${ref}`)
  );
  assert.match(message, new RegExp(`Transaction input ${ref} is no longer available`));
});

test("classifies a missing STT input by matching the context tx hash and index", () => {
  const txHash = "cd".repeat(32);
  const ref = `${txHash}#1`;
  const { message } = parse(
    new Error(`Unknown transaction input (missing from UTxO set): ${ref}`),
    {
      ...BASE_CONTEXT,
      context: { sttInputTxHash: txHash, sttInputOutputIndex: "1" }
    }
  );
  assert.match(message, /selected wallet state is no longer available/);
});

test("classifies a missing locked wallet input from walletInputRefs", () => {
  const txHash = "ef".repeat(32);
  const ref = `${txHash}#2`;
  const { message } = parse(
    new Error(`Unknown transaction input (missing from UTxO set): ${ref}`),
    {
      ...BASE_CONTEXT,
      context: { walletInputRefs: [{ txHash, outputIndex: 2 }] }
    }
  );
  assert.match(message, new RegExp(`selected fund pool ${ref} is no longer available`));
});

test("classifies a missing wallet-script input by walletInputTxHash/index", () => {
  const txHash = "11".repeat(32);
  const ref = `${txHash}#0`;
  const { message } = parse(
    new Error(`Unknown transaction input (missing from UTxO set): ${ref}`),
    {
      ...BASE_CONTEXT,
      context: { walletInputTxHash: txHash, walletInputOutputIndex: 0 }
    }
  );
  assert.match(message, new RegExp(`selected smart-wallet input ${ref} is no longer available`));
});

test("serializes Error metadata (name/message/stage/details) into details JSON", () => {
  const error = new Error("boom");
  (error as { stage?: unknown }).stage = "finalize";
  (error as { details?: unknown }).details = { redeemer: "SPEND" };
  const { details } = parse(error);
  const parsed = JSON.parse(details) as Record<string, unknown>;
  assert.equal(parsed.errorName, "Error");
  assert.equal(parsed.errorMessage, "boom");
  assert.equal(parsed.errorStage, "finalize");
  assert.deepEqual(parsed.errorDetails, { redeemer: "SPEND" });
  assert.equal(parsed.action, "use-allowance");
});

test("serializes cause code/info/status when the cause is a record", () => {
  const error = new Error("outer");
  (error as { cause?: unknown }).cause = { code: 42, info: "detail", status: 500 };
  const { details } = parse(error);
  const parsed = JSON.parse(details) as Record<string, unknown>;
  assert.equal(parsed.causeCode, 42);
  assert.equal(parsed.causeInfo, "detail");
  assert.equal(parsed.causeStatus, 500);
});

test("serializes response/data/status/code for plain-object errors", () => {
  const { details } = parse({ response: { ok: false }, status: 400, code: "X", info: "y" });
  const parsed = JSON.parse(details) as Record<string, unknown>;
  assert.deepEqual(parsed.response, { ok: false });
  assert.equal(parsed.status, 400);
  assert.equal(parsed.code, "X");
  assert.equal(parsed.info, "y");
  assert.deepEqual(parsed.error, { response: { ok: false }, status: 400, code: "X", info: "y" });
});
