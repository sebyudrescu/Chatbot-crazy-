import { NextRequest, NextResponse } from "next/server";
import { createResponseRevisionDraft, listResponseRevisions } from "@/lib/response-revisions";
import { dashboardAuthErrorResponse, requireDashboardActor, requireResourcePermission } from "@/lib/workspace-auth";

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const actor = await requireDashboardActor(request);
    await requireResourcePermission(actor, "message", id, "conversation.read");
    return NextResponse.json({ success: true, data: await listResponseRevisions(id) });
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Lettura revisioni non riuscita" }, { status: 400 });
  }
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const actor = await requireDashboardActor(request);
    await requireResourcePermission(actor, "message", id, "conversation.write");
    const data = await createResponseRevisionDraft(id, await request.json());
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Creazione revisione non riuscita" }, { status: 400 });
  }
}
