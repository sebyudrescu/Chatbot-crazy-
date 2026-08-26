import { NextRequest, NextResponse } from "next/server";
import { revokeAgentApiKey } from "@/lib/agent-api-keys";
import { dashboardAuthErrorResponse, requireDashboardActor, requireResourcePermission } from "@/lib/workspace-auth";

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const actor = await requireDashboardActor(request);
    await requireResourcePermission(actor, "apiKey", id, "chatbot.write");
    return NextResponse.json({ success: true, data: await revokeAgentApiKey(id) });
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Revoca non riuscita" }, { status: 400 });
  }
}
