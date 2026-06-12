import { NextResponse } from "next/server";
import { z } from "zod";
import { executeMeshMethod, getBlockfrostProvider, METHOD_VALUES } from "@/lib/mesh/blockfrost-server";

export const runtime = "nodejs";

const RequestSchema = z.object({
  method: z.enum(METHOD_VALUES),
  args: z.array(z.unknown()).default([])
});

function serializeError(error: unknown) {
  if (error instanceof Error) {
    const payload: Record<string, unknown> = {
      name: error.name,
      message: error.message
    };

    if (error.stack) {
      payload.stack = error.stack;
    }

    if ("cause" in error) {
      payload.cause = (error as Error & { cause?: unknown }).cause;
    }

    return payload;
  }

  if (typeof error === "object" && error !== null) {
    return error;
  }

  return { value: String(error) };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  if (typeof error === "object" && error !== null) {
    const message = "message" in error ? error.message : undefined;
    const info = "info" in error ? error.info : undefined;

    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }

    if (typeof info === "string" && info.trim().length > 0) {
      return info;
    }
  }

  return "Unknown error";
}

export async function POST(request: Request) {
  try {
    const payloadUnknown: unknown = await request.json();
    const payload = RequestSchema.parse(payloadUnknown);
    const provider = getBlockfrostProvider();
    const result: unknown = await executeMeshMethod(provider, payload.method, payload.args);

    return NextResponse.json({ result: result as unknown });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error), details: serializeError(error) },
      { status: 500 }
    );
  }
}
