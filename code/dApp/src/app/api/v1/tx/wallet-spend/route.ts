import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "This endpoint is retired. Use /api/v1/tx/stt-spend with action `use` so the State Thread Token is forwarded."
    },
    { status: 410 }
  );
}
