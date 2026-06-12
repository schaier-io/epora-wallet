import { isRecord } from "./guards";
import { buildTxSizeSummary } from "./script-data";

type ErrorWithMetadata = Error & {
  cause?: unknown;
  stage?: string;
  details?: Record<string, unknown>;
};



export function collectErrorText(value: unknown, messages = new Set<string>()) {
  if (typeof value === "string") {
    messages.add(value);
    return messages;
  }

  if (value instanceof Error) {
    messages.add(value.message);
    if (value.stack) {
      messages.add(value.stack);
    }
    if ("cause" in value) {
      collectErrorText((value as ErrorWithMetadata).cause, messages);
    }
    if ("details" in value) {
      collectErrorText((value as ErrorWithMetadata).details, messages);
    }
    return messages;
  }

  if (isRecord(value)) {
    Object.values(value).forEach((entry) => collectErrorText(entry, messages));
  }

  return messages;
}



export function createTxPreview(action: string, summary: string, txHex: string) {
  return {
    action,
    summary,
    cbor: txHex,
    txSize: buildTxSizeSummary(txHex)
  };
}



export function normalizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const payload: Record<string, unknown> = {
      name: error.name,
      message: error.message
    };

    if (error.stack) {
      payload.stack = error.stack;
    }

    if ("cause" in error) {
      payload.cause = (error as ErrorWithMetadata).cause;
    }

    if ("stage" in error) {
      payload.stage = (error as ErrorWithMetadata).stage;
    }

    if ("details" in error) {
      payload.details = (error as ErrorWithMetadata).details;
    }

    return payload;
  }

  if (isRecord(error)) {
    return error;
  }

  return { value: String(error) };
}



export function createStageError(
  stage: string,
  error: unknown,
  details: Record<string, unknown> = {}
): ErrorWithMetadata {
  const normalizedError = normalizeError(error);
  const infoMessage = normalizedError.info;
  const fallbackMessage =
    error instanceof Error ? error.message : "Unexpected transaction builder error";

  const wrapped = new Error(
    `[${stage}] ${typeof infoMessage === "string" ? infoMessage : fallbackMessage}`
  ) as ErrorWithMetadata;
  wrapped.name = "MeshBuildError";
  wrapped.stage = stage;
  wrapped.cause = normalizedError;
  wrapped.details = {
    ...details,
    sourceError: normalizedError
  };

  return wrapped;
}



export async function withStage<T>(
  stage: string,
  operation: () => Promise<T>,
  details: Record<string, unknown> = {}
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw createStageError(stage, error, details);
  }
}


