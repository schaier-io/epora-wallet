import { NextResponse } from "next/server";
import type { HealthResponse } from "@/lib/api/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Routine uptime checks must not wake the database. Dependency probes live at /ready.
export async function GET() {
  const body: HealthResponse = {
    status: "ok",
    ts: new Date().toISOString()
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
