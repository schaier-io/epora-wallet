import { isRecord, safeStringify } from "./guards";
import { type ErrorContext, type ParsedError } from "@/components/user/workspace/types";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceHelpersBuildErrors.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceHelpersBuildErrors", defaultMessages);

function unwrapBuildErrorMessage(message: string) {
  return message.replace(/^\[[^\]]+\]\s*/, "");
}

function collectBuildErrorMessages(
  error: unknown,
  messages = new Set<string>(),
  seen = new WeakSet<object>()
) {
  // SDK errors can arrive with cyclic cause/details chains; the visited set stops
  // the walk where a chain folds back on itself instead of overflowing the stack.
  if (typeof error === "object" && error !== null) {
    if (seen.has(error)) {
      return messages;
    }
    seen.add(error);
  }
  if (error instanceof Error) {
    messages.add(error.message);
    if ("cause" in error) {
      collectBuildErrorMessages((error as { cause?: unknown }).cause, messages, seen);
    }
    if ("details" in error) {
      collectBuildErrorMessages((error as { details?: unknown }).details, messages, seen);
    }
    return messages;
  }

  if (!isRecord(error)) {
    return messages;
  }

  if (typeof error.message === "string") {
    messages.add(error.message);
  }

  if (typeof error.info === "string") {
    messages.add(error.info);
  }

  if ("cause" in error) {
    collectBuildErrorMessages(error.cause, messages, seen);
  }

  if ("sourceError" in error) {
    collectBuildErrorMessages(error.sourceError, messages, seen);
  }

  if ("details" in error) {
    collectBuildErrorMessages(error.details, messages, seen);
  }

  return messages;
}

/**
 * Does this message read like something a person wrote for a person?
 *
 * The last branch of `resolveBuildErrorOutcome` used to print whatever the SDK or the node
 * said, verbatim, as the one sentence above the debug payload. Some of those strings are
 * ours and read fine. The rest are JSON blobs, doubly-escaped ledger errors, and internal
 * assertions that name React providers. A message earns the top line only if it has no
 * braces and ends the way a sentence ends; everything else is printed, untouched, to the
 * browser console with the full serialized error.
 */
function looksWrittenForAPerson(message: string): boolean {
  return !/[{}]/.test(message) && /[.!?]$/.test(message.trim());
}

const UNRECOGNISED_BUILD_ERROR = i18n("somethingWentWrongWhilePreparingThisTransaction");

const USER_DECLINED_TO_SIGN = i18n("youDeclinedToSignInYourWallet");

/**
 * Closing the wallet's signature prompt (or pressing its cancel) is the user's own
 * decision, not a failure. Wallets phrase it variously ("user declined to sign tx",
 * "signing cancelled"), so match on the decision words rather than an error code — a
 * `DataSignError` with a key problem, for instance, must stay a real error.
 */
const DECLINED_TO_SIGN_PATTERNS: RegExp[] = [
  /declined to sign/i,
  /refused to sign/i,
  /user declined/i,
  /user refused/i,
  /user rejected/i,
  /user cancel(?:l)?ed/i,
  /cancel(?:l)?ed by user/i,
  /signing cancel(?:l)?ed/i
];

function declinedToSign(error: unknown) {
  const messages = [...collectBuildErrorMessages(error)];
  return DECLINED_TO_SIGN_PATTERNS.some((pattern) =>
    messages.some((message) => pattern.test(message))
  );
}

/**
 * Payload serialization for the console diagnostic. SDK and wallet errors carry
 * shapes plain JSON.stringify throws on (cyclic cause/detail objects, BigInt
 * fields), and a throw used to degrade the whole logged payload to
 * "[object Object]", dropping the diagnostic id with it. The fast path is the
 * plain serialization; only a failing payload falls back to a WeakSet replacer
 * that serializes what it can and cuts repeat references instead. The final
 * catch keeps `safeStringify`'s never-throwing contract for anything stranger
 * (a throwing `toJSON`, say).
 */
function diagnosticPayloadStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    // Cyclic or otherwise unserializable payload; serialize what survives.
  }
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(
      value,
      (_key: string, serializedValue: unknown) => {
        if (typeof serializedValue === "bigint") {
          return serializedValue.toString();
        }
        if (typeof serializedValue === "object" && serializedValue !== null) {
          if (seen.has(serializedValue)) {
            return "[circular]";
          }
          seen.add(serializedValue);
        }
        return serializedValue;
      },
      2
    );
  } catch {
    return safeStringify(value);
  }
}

/** `[message, expected]`: the sentence a person reads, and whether the failure is a
 * recognised, recoverable condition (unexpected ones get logged with full detail). */
/**
 * An Error whose message this application wrote on purpose for the reader: a recognised,
 * user-correctable condition (a validation rule, a state the reader must change) rather
 * than an unexpected failure. Ownership, not punctuation, is what marks a message
 * expected — an arbitrary SDK error that happens to read like a sentence ("Wallet
 * signing failed.") must stay unexpected so its console diagnostic survives.
 */
export class OwnedMessageError extends Error {}

function carriesOwnedMessage(error: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof error === "object" && error !== null) {
    if (seen.has(error)) {
      return false;
    }
    seen.add(error);
  }
  if (error instanceof OwnedMessageError) {
    return true;
  }

  if (error instanceof Error) {
    return "cause" in error
      ? carriesOwnedMessage((error as { cause?: unknown }).cause, seen)
      : false;
  }

  if (!isRecord(error)) {
    return false;
  }

  for (const key of ["cause", "sourceError", "details"] as const) {
    if (key in error && carriesOwnedMessage(error[key], seen)) {
      return true;
    }
  }

  return false;
}

function createDiagnosticId(details: string) {
  const timestampPart = Date.now().toString(36);
  let hash = 0;
  for (const character of details) {
    hash = ((hash * 31) + character.charCodeAt(0)) % 36 ** 4;
  }
  return `${timestampPart}-${hash.toString(36).padStart(4, "0")}`;
}

function resolveBuildErrorOutcome(
  error: unknown,
  fallback: string,
  action: string
): readonly [string, boolean] {
  const allMessages = [...collectBuildErrorMessages(error)].map(unwrapBuildErrorMessage);

  if (declinedToSign(error)) {
    return [USER_DECLINED_TO_SIGN, true];
  }

  if (allMessages.some((message) => message.includes("Maximum Input Count Exceeded"))) {
    return ["This transaction is bigger than Cardano allows. Choose fewer fund pools, or fewer payouts, and try again. If it still fails, run Tidy wallet funds first to merge the pools, then send.", true];
  }

  if (
    allMessages.some((message) =>
      message.includes("No shared STT reference script is deployed")
    )
  ) {
    return ["This wallet still needs its one-time shared setup helper before it can do this. Go back to the wallet home, run the setup it offers, then try again.", true];
  }

  if (allMessages.some((message) => message.includes("PPViewHashesDontMatch"))) {
    return ["Cardano's settings changed while this transaction was being prepared, so the network rejected it. Try again: the app picks up the new settings before it opens your wallet.", true];
  }

  if (
    allMessages.some((message) =>
      message.includes("No wallet UTxO can cover script collateral")
    )
  ) {
    return ["Your connected wallet needs one holding with about 6 ADA in it, a little more if that holding also carries tokens. Cardano sets 5 ADA aside as a deposit while a smart wallet transaction runs, and returns it when the transaction succeeds. Tokens in that holding come back to you, so it does not have to be a token-free holding. Add ADA to the wallet, then try again. You do not need to set collateral in your wallet app.", true];
  }

  if (allMessages.some((message) => message.includes("BabbageOutputTooSmallUTxO"))) {
    return ["Cardano rejected this transaction because one of its payments holds less ADA than the network allows. If you staged a very small payout, raise it and try again.", true];
  }

  // Ogmios returned `EvaluationFailure` with an EMPTY `ScriptFailures` map (no per-redeemer
  // detail). In practice this has two causes: a Plutus validator REJECTED the transaction
  // without surfacing a trace (most common: the action is not permitted for the wallet's
  // current State), or the evaluator could not resolve an input / reference script / datum.
  // The message text is doubly JSON-escaped, so allow backslashes/quotes/colons before `{}`.
  if (
    allMessages.some(
      (message) =>
        /EvaluationFailure/.test(message) && /ScriptFailures[\\"\s:]*\{\s*\}/.test(message)
    )
  ) {
    const actionMessage: Record<string, string> = {
      "use-allowance": i18n("paymentNoLongerFitsConnectedWalletAllowance"),
      "use-beneficiary": i18n("recoveryPaymentNoLongerMatchesWalletRules"),
      "renew-proof-of-life": i18n("walletCanNoLongerRenewProofOfLife"),
      "payout-streaming-payment": i18n("scheduledPaymentNoLongerFitsWalletRules"),
      "consolidate-utxo": i18n("selectedPathCanNoLongerTidyFunds")
    };
    if (
      action === "use" ||
      action === "update-state" ||
      action === "manage-streaming-payments" ||
      action === "wallet-withdraw" ||
      action === "wallet-publish" ||
      action === "wallet-vote" ||
      action === "set-intended-stake-credential"
    ) {
      return [
        i18n("connectedWalletCanNoLongerUseThis"),
        true
      ];
    }
    return [
      actionMessage[action] ??
        i18n("walletBlockedActionWithoutRule"),
      true
    ];
  }

  const unwrappedFallback = unwrapBuildErrorMessage(fallback);

  // Ownership, not punctuation, decides expected-ness: a branded application message is
  // a recognised condition even though it reads like a sentence, while an arbitrary SDK
  // message that also reads like one stays unexpected and keeps its console diagnostic.
  return [
    looksWrittenForAPerson(unwrappedFallback) ? unwrappedFallback : UNRECOGNISED_BUILD_ERROR,
    carriesOwnedMessage(error)
  ];
}

function extractMissingTransactionInputRef(error: unknown) {
  for (const message of collectBuildErrorMessages(error)) {
    // Three spellings of one event, the chain moving on under the draft: the ledger
    // rejecting an input it no longer has ("Unknown transaction input..."), our own
    // builder failing to resolve a selected input against current chain state
    // ("UTxO not found", thrown by the mesh internals when a fetched pool list is
    // stale), and the mint reference input vanishing from the spendable wallet set.
    // The "#index" tail is optional: the internals omit it when the caller passed
    // no output index (e.g. wallet governance flows).
    const match = message.match(
      /Unknown transaction input \(missing from UTxO set\): ([0-9a-f]{64}(?:#\d+)?)|UTxO not found: ([0-9a-f]{64}(?:#\d+)?)|Selected mint reference UTxO ([0-9a-f]{64}(?:#\d+)?) was not found/i
    );
    const missingRef = match?.[1] ?? match?.[2] ?? match?.[3];
    if (missingRef) {
      return missingRef.toLowerCase();
    }
  }

  return null;
}

function describeMissingInputRole(
  missingRef: string,
  errorContext: ErrorContext
): "stt" | "locked-wallet" | "wallet-script" | null {
  const sttInputTxHash =
    typeof errorContext.context?.sttInputTxHash === "string"
      ? errorContext.context.sttInputTxHash.toLowerCase()
      : null;
  const sttInputOutputIndex =
    typeof errorContext.context?.sttInputOutputIndex === "string"
      ? Number(errorContext.context.sttInputOutputIndex)
      : typeof errorContext.context?.sttInputOutputIndex === "number"
        ? errorContext.context.sttInputOutputIndex
        : null;

  if (
    sttInputTxHash &&
    typeof sttInputOutputIndex === "number" &&
    missingRef === `${sttInputTxHash}#${sttInputOutputIndex}`
  ) {
    return "stt";
  }

  const walletInputRefs = Array.isArray(errorContext.context?.walletInputRefs)
    ? errorContext.context.walletInputRefs
    : [];
  const hasLockedWalletInput = walletInputRefs.some((entry) => {
    if (!isRecord(entry)) {
      return false;
    }

    const txHash =
      typeof entry.txHash === "string" ? entry.txHash.toLowerCase() : null;
    const outputIndex =
      typeof entry.outputIndex === "number" ? entry.outputIndex : null;

    return txHash !== null && outputIndex !== null && missingRef === `${txHash}#${outputIndex}`;
  });

  if (hasLockedWalletInput) {
    return "locked-wallet";
  }

  const walletInputTxHash =
    typeof errorContext.context?.walletInputTxHash === "string"
      ? errorContext.context.walletInputTxHash.toLowerCase()
      : null;
  const walletInputOutputIndex =
    typeof errorContext.context?.walletInputOutputIndex === "string"
      ? Number(errorContext.context.walletInputOutputIndex)
      : typeof errorContext.context?.walletInputOutputIndex === "number"
        ? errorContext.context.walletInputOutputIndex
        : null;

  if (
    walletInputTxHash &&
    typeof walletInputOutputIndex === "number" &&
    missingRef === `${walletInputTxHash}#${walletInputOutputIndex}`
  ) {
    return "wallet-script";
  }

  return null;
}

export function formatBuildError(error: unknown, errorContext: ErrorContext): ParsedError {
  const now = new Date().toISOString();
  const fallbackMessage = error instanceof Error ? error.message : i18n("failedToBuildTransaction");
  const missingInputRef = extractMissingTransactionInputRef(error);
  const missingInputRole = missingInputRef
    ? describeMissingInputRole(missingInputRef, errorContext)
    : null;
  const [message, expected] = missingInputRef
    ? [
        missingInputRole === "stt"
          ? i18n("thisWalletHasMovedOnSinceYouOpened")
          : missingInputRole === "locked-wallet"
            ? i18n("fundPoolMissinginputrefHasAlreadyBeenSpentReload", { missingInputRef: missingInputRef })
            : missingInputRole === "wallet-script"
              ? i18n("fundPoolMissinginputrefHasAlreadyBeenSpentReload_aff0e8", { missingInputRef: missingInputRef })
              : i18n("someOfTheMoneyThisTransactionSpendsMissinginputref", { missingInputRef: missingInputRef }),
        true
      ] as const
    : resolveBuildErrorOutcome(error, fallbackMessage, errorContext.action);

  const serializedError: Record<string, unknown> = {
    timestamp: now,
    action: errorContext.action,
    wallet: errorContext.wallet,
    networkId: errorContext.networkId,
    context: errorContext.context ?? {}
  };

  if (error instanceof Error) {
    serializedError.errorName = error.name;
    serializedError.errorMessage = error.message;
    serializedError.errorStack = error.stack ?? "";
    if ("stage" in error) {
      const stage = (error as { stage?: unknown }).stage;
      if (typeof stage === "string") {
        serializedError.errorStage = stage;
      }
    }
    if ("details" in error) {
      serializedError.errorDetails = (error as { details?: unknown }).details;
    }
    if ("cause" in error) {
      const cause = (error as { cause?: unknown }).cause;
      serializedError.errorCause = cause;
      if (isRecord(cause)) {
        if ("code" in cause) {
          serializedError.causeCode = cause.code;
        }
        if ("info" in cause) {
          serializedError.causeInfo = cause.info;
        }
        if ("status" in cause) {
          serializedError.causeStatus = cause.status;
        }
      }
    }
  } else {
    serializedError.error = error;
  }

  if (isRecord(error)) {
    if ("response" in error) {
      serializedError.response = error.response;
    }
    if ("data" in error) {
      serializedError.data = error.data;
    }
    if ("status" in error) {
      serializedError.status = error.status;
    }
    if ("code" in error) {
      serializedError.code = error.code;
    }
    if ("info" in error) {
      serializedError.info = error.info;
    }
  }

  // The id is derived from the serialized payload and then embedded in the copy
  // that reaches the console, so the reference the reader quotes is the one the
  // log line shows, even when the error payload itself cannot serialize.
  const details = diagnosticPayloadStringify(serializedError);
  const diagnosticId = expected ? null : createDiagnosticId(details);
  return {
    message,
    expected,
    diagnosticId,
    staleInputs: missingInputRef !== null,
    details: diagnosticId
      ? diagnosticPayloadStringify({ diagnosticId, ...serializedError })
      : details
  };
}
