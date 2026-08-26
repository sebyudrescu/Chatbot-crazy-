import { NextRequest, NextResponse } from "next/server";
import { updateResponseRevisionDraft } from "@/lib/response-revisions";
import { dashboardAuthErrorResponse, requireDashboardActor, requireResourcePermission } from "@/lib/workspace-auth";

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const actor = await requireDashboardActor(request);
    await requireResourcePermission(actor, "responseRevision", id, "conversation.write");
    return NextResponse.json({ success: true, data: await updateResponseRevisionDraft(id, await request.json()) });
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Aggiornamento revisione non riuscito" }, { status: 400 });
  }
}
