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

function resolveBuildErrorMessage(error: unknown, fallback: string) {
  const allMessages = [...collectBuildErrorMessages(error)].map(unwrapBuildErrorMessage);

  if (allMessages.some((message) => message.includes("Maximum Input Count Exceeded"))) {
    return i18n("thisActionIsTooLargeForOneCardano");
  }

  if (
    allMessages.some((message) =>
      message.includes("No shared STT reference script is deployed")
    )
  ) {
    return i18n("thisActionNeedsEporaSOneTimeTransaction");
  }

  if (allMessages.some((message) => message.includes("PPViewHashesDontMatch"))) {
    return i18n("networkSettingsChangedWhileThisTransactionWasBeing");
  }

  if (
    allMessages.some((message) =>
      message.includes("No suitable ADA-only wallet UTxO found for manual script collateral")
    )
  ) {
    return i18n("yourConnectedWalletNeedsOneAdaOnlyEntry");
  }

  if (allMessages.some((message) => message.includes("BabbageOutputTooSmallUTxO"))) {
    return i18n("oneDestinationNeedsMoreAdaToMeetCardano");
  }

  // Ogmios returned `EvaluationFailure` with an EMPTY `ScriptFailures` map (no per-redeemer
  // detail). In practice this has two causes: a Plutus validator REJECTED the transaction
  // without surfacing a trace (most common — the action is not permitted for the wallet's
  // current State), or the evaluator could not resolve an input / reference script / datum.
  // The message text is doubly JSON-escaped, so allow backslashes/quotes/colons before `{}`.
  if (
    allMessages.some(
      (message) =>
        /EvaluationFailure/.test(message) && /ScriptFailures[\\"\s:]*\{\s*\}/.test(message)
    )
  ) {
    return i18n("theWalletSOnChainRulesRejectedThis");
  }

  return unwrapBuildErrorMessage(fallback);
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
  const fallbackMessage =
    i18n("couldnTBuildThisTransactionCheckTheSelected");
  const missingInputRef = extractMissingTransactionInputRef(error);
  const missingInputRole = missingInputRef
    ? describeMissingInputRole(missingInputRef, errorContext)
    : null;
  const message = missingInputRef
    ? missingInputRole === "stt"
      ? i18n("theSelectedWalletIdentityInputMissinginputrefIsNo", { missingInputRef: missingInputRef })
      : missingInputRole === "locked-wallet"
        ? i18n("theSelectedFundPoolMissinginputrefIsNoLonger", { missingInputRef: missingInputRef })
        : missingInputRole === "wallet-script"
          ? i18n("theSelectedSmartWalletInputMissinginputrefIsNo", { missingInputRef: missingInputRef })
          : i18n("transactionInputMissinginputrefIsNoLongerAvailableIt", { missingInputRef: missingInputRef })
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
