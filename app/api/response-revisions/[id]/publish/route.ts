import { NextRequest, NextResponse } from "next/server";
import { publishResponseRevision } from "@/lib/response-revisions";
import { dashboardAuthErrorResponse, requireDashboardActor, requireResourcePermission } from "@/lib/workspace-auth";

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const actor = await requireDashboardActor(request);
    await requireResourcePermission(actor, "responseRevision", id, "knowledge.write");
    return NextResponse.json({ success: true, data: await publishResponseRevision(id) });
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Pubblicazione Q&A non riuscita" }, { status: 400 });
  }
}
