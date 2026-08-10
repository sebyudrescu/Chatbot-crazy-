import { NextResponse } from "next/server";
import { BackstageChatSchema } from "@/lib/backstage-contract";
import { runBackstageTurn } from "@/lib/backstage-service";

export async function POST(request: Request) {
  try {
    const input = BackstageChatSchema.parse(await request.json());
    return NextResponse.json({ success: true, data: await runBackstageTurn(input.sessionId, input.message) });
  } catch (error) {
    console.error("[Backstage] chat failed", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Il copilota non ha completato la richiesta" }, { status: 400 });
  }
}

