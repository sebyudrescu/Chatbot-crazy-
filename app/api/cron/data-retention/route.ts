import { NextRequest, NextResponse } from "next/server";
import { cleanupExpiredData } from "@/lib/data-retention";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json(
      { success: false, error: "Accesso non autorizzato" },
      { status: 401 },
    );
  }

  try {
    const data = await cleanupExpiredData();
    return NextResponse.json(
      { success: true, data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Scheduled data retention failed:", error);
    return NextResponse.json(
      { success: false, error: "Pulizia schedulata non riuscita" },
      { status: 500 },
    );
  }
}
