import { NextResponse } from "next/server";
import { buildOpenApiDocument } from "@/lib/api/openapi";

export const runtime = "nodejs";

// Generated from the zod schemas on demand rather than read from
// docs/api/openapi.json, so what the app serves cannot drift from what it
// validates. `pnpm openapi:check` guarantees the committed copy is the same
// document, so the two are interchangeable by construction.
//
// The result is stable for the life of a deployment, so it is built once.
const document = buildOpenApiDocument();

export function GET() {
  return NextResponse.json(document, {
    headers: {
      // Same document for every caller until the next deploy.
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600"
    }
  });
}
