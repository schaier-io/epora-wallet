import { isRecord, safeStringify } from "./guards";
import { type ErrorContext, type ParsedError } from "@/components/user/workspace/types";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceHelpersBuildErrors.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceHelpersBuildErrors", defaultMessages);

function unwrapBuildErrorMessage(message: string) {
  return message.replace(/^\[[^\]]+\]\s*/, "");
}

function collectBuildErrorMessages(error: unknown, messages = new Set<string>()) {
  if (error instanceof Error) {
    messages.add(error.message);
    if ("cause" in error) {
      collectBuildErrorMessages((error as { cause?: unknown }).cause, messages);
    }
    if ("details" in error) {
      collectBuildErrorMessages((error as { details?: unknown }).details, messages);
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
    collectBuildErrorMessages(error.cause, messages);
  }

  if ("sourceError" in error) {
    collectBuildErrorMessages(error.sourceError, messages);
  }

  if ("details" in error) {
    collectBuildErrorMessages(error.details, messages);
  }

  return messages;
}

/**
 * Does this message read like something a person wrote for a person?
 *
 * The last branch of `resolveBuildErrorMessage` used to print whatever the SDK or the node
 * said, verbatim, as the one sentence above `Debug details`. Some of those strings are ours
 * and read fine. The rest are JSON blobs, doubly-escaped ledger errors, and internal
 * assertions that name React providers. A message earns the top line only if it has no
 * braces and ends the way a sentence ends; everything else is still available, untouched,
 * inside `Debug details`.
 */
function looksWrittenForAPerson(message: string): boolean {
  return !/[{}]/.test(message) && /[.!?]$/.test(message.trim());
}

const UNRECOGNISED_BUILD_ERROR =
  "Something went wrong while preparing this transaction. Try again. If it keeps failing, open Debug details below and send us what it says.";

function resolveBuildErrorMessage(error: unknown, fallback: string) {
  const allMessages = [...collectBuildErrorMessages(error)].map(unwrapBuildErrorMessage);

  if (allMessages.some((message) => message.includes("Maximum Input Count Exceeded"))) {
    return "This transaction is bigger than Cardano allows. Choose fewer fund pools, or fewer payouts, and try again. If it still fails, run Tidy wallet funds first to merge the pools, then send.";
  }

  if (
    allMessages.some((message) =>
      message.includes("No shared STT reference script is deployed")
    )
  ) {
    return "This wallet still needs its one-time shared setup helper before it can do this. Go back to the wallet home, run the setup it offers, then try again.";
  }

  if (allMessages.some((message) => message.includes("PPViewHashesDontMatch"))) {
    return "Cardano's settings changed while this transaction was being prepared, so the network rejected it. Try again: the app picks up the new settings before it opens your wallet.";
  }

  if (
    allMessages.some((message) =>
      message.includes("No suitable ADA-only wallet UTxO found for manual script collateral")
    )
  ) {
    return "Your connected wallet needs a spare holding of at least 5 ADA that carries no other tokens. Cardano sets it aside as a deposit while a smart wallet transaction runs, and releases it when the transaction succeeds. Send yourself 5 ADA on its own, then try again. You do not need to set collateral in your wallet app.";
  }

  if (allMessages.some((message) => message.includes("BabbageOutputTooSmallUTxO"))) {
    return "Cardano rejected this transaction because one of its payments holds less ADA than the network allows. If you staged a very small payout, raise it and try again. Otherwise try again as-is, and if it keeps failing, open Debug details below and send us what it says.";
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
    return "The wallet's own rules refused this action, and Cardano did not say which rule. Check that you are allowed to do this from the connected wallet, and that the wallet's settings still permit it. If you sent something else moments ago, wait a little and try again.";
  }

  const unwrappedFallback = unwrapBuildErrorMessage(fallback);

  return looksWrittenForAPerson(unwrappedFallback) ? unwrappedFallback : UNRECOGNISED_BUILD_ERROR;
}

function extractMissingTransactionInputRef(error: unknown) {
  for (const message of collectBuildErrorMessages(error)) {
    const match = message.match(
      /Unknown transaction input \(missing from UTxO set\): ([0-9a-f]{64}#\d+)/i
    );
    if (match?.[1]) {
      return match[1].toLowerCase();
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
  const message = missingInputRef
    ? missingInputRole === "stt"
      ? i18n("thisWalletHasMovedOnSinceYouOpened")
      : missingInputRole === "locked-wallet"
        ? i18n("fundPoolMissinginputrefHasAlreadyBeenSpentReload", { missingInputRef: missingInputRef })
        : missingInputRole === "wallet-script"
          ? i18n("fundPoolMissinginputrefHasAlreadyBeenSpentReload_aff0e8", { missingInputRef: missingInputRef })
          : i18n("someOfTheMoneyThisTransactionSpendsMissinginputref", { missingInputRef: missingInputRef })
    : resolveBuildErrorMessage(error, fallbackMessage);

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

  return {
    message,
    details: safeStringify(serializedError)
  };
}

