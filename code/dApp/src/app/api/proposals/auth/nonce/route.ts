import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/proposals/api-helpers";
import { issueNonce } from "@/lib/proposals/auth";

export const runtime = "nodejs";

const RequestSchema = z.object({
  address: z.string().trim().min(1)
});

// Issues a short-lived, address-bound nonce for the wallet to sign with CIP-30
// `signData`. Proving control of the signing key is the entire authentication —
// there is no password and no user record.
export async function POST(request: Request) {
  try {
    const body = RequestSchema.parse(await request.json());
    return NextResponse.json({ nonce: issueNonce(body.address) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid request.", 400);
    }
    return jsonError("Could not issue a sign-in nonce.", 500);
  }
}
