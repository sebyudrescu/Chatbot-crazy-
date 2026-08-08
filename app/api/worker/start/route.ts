import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error:
        "Endpoint ritirato: i job di ingestion vengono avviati automaticamente dal workflow durevole.",
    },
    { status: 410 },
  );
}
