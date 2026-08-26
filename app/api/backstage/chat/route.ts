import { NextRequest, NextResponse } from "next/server";
import { BackstageChatSchema } from "@/lib/backstage-contract";
import { runBackstageTurn } from "@/lib/backstage-service";
import { dashboardAuthErrorResponse, requireDashboardActor, requireResourcePermission } from "@/lib/workspace-auth";

export async function POST(request: NextRequest) {
  try {
    const input = BackstageChatSchema.parse(await request.json());
    const actor = await requireDashboardActor(request);
    await requireResourcePermission(actor, "backstageSession", input.sessionId, "chatbot.write");
    return NextResponse.json({ success: true, data: await runBackstageTurn(input.sessionId, input.message) });
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("[Backstage] chat failed", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Il copilota non ha completato la richiesta" }, { status: 400 });
  }
}
