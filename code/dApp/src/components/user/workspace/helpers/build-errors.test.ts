import { test } from "node:test";
import assert from "node:assert/strict";
import { formatBuildError, OwnedMessageError } from "./build-errors";
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
  assert.match(message, /bigger than Cardano allows/);
});

test("maps a missing shared STT reference to deploy guidance", () => {
  const { message } = parse(
    new Error("No shared STT reference script is deployed for the current validator")
  );
  assert.match(message, /one-time shared setup helper/);
});

test("maps PPViewHashesDontMatch to the retry guidance", () => {
  const { message } = parse(new Error("Ledger error: PPViewHashesDontMatch (...)"));
  assert.match(message, /settings changed while this transaction was being prepared/);
});

test("maps missing collateral to the collateral guidance", () => {
  const { message } = parse(
    new Error("No wallet UTxO can cover script collateral")
  );
  assert.match(message, /one holding with about 6 ADA/);
});

test("maps BabbageOutputTooSmallUTxO to the min-lovelace guidance", () => {
  const { message } = parse(new Error("BabbageOutputTooSmallUTxO detected"));
  assert.match(message, /holds less ADA than the network allows/);
});

test("maps an EvaluationFailure with an empty ScriptFailures map to the rejection guidance", () => {
  // Doubly JSON-escaped shape the comment in the source describes.
  const { message } = parse(
    new Error('EvaluationFailure: {\\"ScriptFailures\\": {}}')
  );
  assert.match(message, /refused this action, and Cardano did not say which rule/);
});

test("strips a leading [bracketed] stage prefix from an unmatched message", () => {
  const { message } = parse(new Error("[prepare-inputs] Some unexpected failure happened."));
  assert.equal(message, "Some unexpected failure happened.");
});

test("walks nested causes/details to find a matching message", () => {
  const inner = new Error("BabbageOutputTooSmallUTxO");
  const outer = new Error("build failed");
  (outer as { cause?: unknown }).cause = inner;
  const { message } = parse(outer);
  assert.match(message, /holds less ADA than the network allows/);
});

test("passes an unmatched message through when it reads like a sentence", () => {
  const { message } = parse(new Error("The proof of life date must be a real date and time."));
  assert.equal(message, "The proof of life date must be a real date and time.");
});

// The finding: the unmatched default printed raw SDK text as the one sentence a person
// reads. The full serialized error goes to the browser console, so the top line stops
// carrying machine output — and only machine output reaches the console at all.
test("replaces an unmatched machine message with the generic sentence", () => {
  const blob = parse(new Error('EvaluationFailure: {"ScriptFailures": {"spend:0": ["boom"]}}'));
  assert.match(blob.message, /Something went wrong while preparing this transaction/);
  // The diagnostic reference replaced the console instruction: the reader contacts
  // support with the id, the console keeps the full serialized error.
  assert.match(blob.message, /contact support/);
  assert.doesNotMatch(blob.message, /console/);
  // Machine output is the one thing the console is for.
  assert.equal(blob.expected, false);
  // Nothing is lost: the raw text is still in the details payload.
  assert.match(blob.details, /ScriptFailures/);

  // No terminal punctuation reads as an internal assertion, not a sentence.
  const assertion = parse(new Error("useWorkspaceActions must be used within a WorkspaceActionsProvider"));
  assert.match(assertion.message, /Something went wrong while preparing this transaction/);
  assert.equal(assertion.expected, false);
});

test("expected outcomes are marked so the UI can stay calm and the console quiet", () => {
  // Every named ledger rule reads as a handled condition.
  const named = parse(new Error("Maximum Input Count Exceeded during build"));
  assert.equal(named.expected, true);

  // So is a message the application branded as its own: the app wrote it for the
  // reader, on purpose.
  const owned = parse(
    new OwnedMessageError("The proof of life date must be a real date and time.")
  );
  assert.equal(owned.message, "The proof of life date must be a real date and time.");
  assert.equal(owned.expected, true);
});

/**
 * Punctuation is not ownership. An arbitrary SDK or wallet error that happens to be a
 * complete sentence must not pass as an expected outcome — expected suppresses the
 * console error, and this failure is exactly the kind that needs its diagnostic kept.
 */
test("a sentence-terminated non-decline signing error stays unexpected", () => {
  const signing = parse(new Error("Wallet signing failed."));
  assert.equal(signing.message, "Wallet signing failed.");
  assert.equal(signing.expected, false);
});

test("a declined signature reads as the reader's own choice, not a failure", () => {
  // CIP-30 wallets phrase the cancel in a few ways; these came up in practice.
  const declined = parse(new Error("DataSignError (Code 3): user declined to sign tx"));
  assert.match(declined.message, /You declined to sign in your wallet/);
  assert.match(declined.message, /nothing was sent and nothing changed/);
  assert.equal(declined.expected, true);

  const cancelled = parse(new Error("Signing cancelled"));
  assert.match(cancelled.message, /You declined to sign in your wallet/);
  assert.equal(cancelled.expected, true);
});

test("a signature failure that is not the reader's choice stays a real error", () => {
  // Code 1: proof generation failed — the key could not sign at all, declining was
  // nobody's decision, so this must not be dressed up as a calm outcome.
  const proofFailed = parse(new Error("DataSignError (Code 1): proof generation failed"));
  assert.doesNotMatch(proofFailed.message, /You declined to sign/);
});

test("uses the generic sentence for non-Error inputs with no message", () => {
  const { message } = parse({ some: "object" });
  assert.match(message, /Something went wrong while preparing this transaction/);
});

test("rewrites an unknown missing-input ref with the generic UTxO-set message", () => {
  const ref = `${"ab".repeat(32)}#3`;
  const { message } = parse(
    new Error(`Unknown transaction input (missing from UTxO set): ${ref}`)
  );
  assert.match(message, new RegExp(`Some of the money this transaction spends \\(${ref}\\) is no longer there`));
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
  assert.match(message, /This wallet has moved on since you opened this screen/);
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
  assert.match(message, new RegExp(`Fund pool ${ref} has already been spent`));
  // The clause that separates this role from the wallet-script one below.
  assert.match(message, /remove that one/);
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
  assert.match(message, new RegExp(`Fund pool ${ref} has already been spent`));
  assert.doesNotMatch(message, /remove that one/);
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

// Support correlates the id the reader quotes with the console log line, so the
// id must be inside the logged payload, not only next to it.
test("an unexpected failure embeds its diagnostic id in the logged details", () => {
  const blob = parse(new Error("Wallet signing failed."));
  assert.equal(blob.expected, false);
  assert.ok(blob.diagnosticId);
  const logged = JSON.parse(blob.details) as Record<string, unknown>;
  assert.equal(logged.diagnosticId, blob.diagnosticId);
});

test("an expected outcome carries no diagnostic id and unmodified details", () => {
  const blob = parse(new Error("Maximum Input Count Exceeded during build"));
  assert.equal(blob.expected, true);
  assert.equal(blob.diagnosticId, null);
  const logged = JSON.parse(blob.details) as Record<string, unknown>;
  assert.equal("diagnosticId" in logged, false);
});
