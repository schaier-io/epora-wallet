import { NextResponse } from "next/server";
import { z } from "zod";
import { runSttBackgroundSync } from "@/lib/stt-cache/indexer";

export const runtime = "nodejs";

const RequestSchema = z.object({
  recentHeadPageBudget: z.number().int().min(1).max(50).optional(),
  historyBackfillPageBudget: z.number().int().min(1).max(100).optional()
});

function isAuthorized(request: Request) {
  const configuredSecret = process.env.STT_SYNC_SECRET?.trim();
  if (!configuredSecret) {
    throw new Error("Missing STT_SYNC_SECRET in environment.");
  }

  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim() === configuredSecret;
  }

  const headerSecret = request.headers.get("x-stt-sync-secret");
  return headerSecret?.trim() === configuredSecret;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unknown error";
}

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        {
          error: "Unauthorized."
        },
        {
          status: 401
        }
      );
    }

    let bodyUnknown: unknown = {};
    try {
      bodyUnknown = await request.json();
    } catch {
      bodyUnknown = {};
    }

    const body = RequestSchema.parse(bodyUnknown);
    const result = await runSttBackgroundSync(body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: error.issues[0]?.message ?? "Invalid STT sync request."
        },
        {
          status: 400
        }
      );
    }

    return NextResponse.json(
      {
        error: getErrorMessage(error)
      },
      {
        status: 500
      }
    );
  }
}
