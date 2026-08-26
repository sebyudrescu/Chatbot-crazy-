import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  CreateHelpDeskSavedViewSchema,
  parseHelpDeskSavedViewFilters,
} from "@/lib/helpdesk-filters";
import {
  DEFAULT_AGENCY_WORKSPACE_ID,
  DashboardAuthError,
  allowedWorkspaceIds,
  dashboardAuthErrorResponse,
  requireBotPermission,
  requireDashboardActor,
  type DashboardActor,
} from "@/lib/workspace-auth";

const MAX_SAVED_VIEWS = 20;

async function resolveWorkspace(actor: DashboardActor, botId?: string | null) {
  if (botId) return (await requireBotPermission(actor, botId, "conversation.read")).workspaceId;
  if (actor.kind === "legacy_owner") return DEFAULT_AGENCY_WORKSPACE_ID;
  const workspaceIds = allowedWorkspaceIds(actor, "conversation.read") || [];
  if (workspaceIds.length !== 1) throw new DashboardAuthError("Seleziona un agente per scegliere il workspace", 403);
  return workspaceIds[0];
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireDashboardActor(request);
    const workspaceIds = allowedWorkspaceIds(actor, "conversation.read");
    const views = await prisma.helpDeskSavedView.findMany({
      where: workspaceIds === null ? {} : { workspaceId: { in: workspaceIds } },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    });
    return NextResponse.json({
      success: true,
      data: views.map((view) => ({ ...view, filters: parseHelpDeskSavedViewFilters(view.filters) })),
    });
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({ success: false, error: "Viste non disponibili" }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = CreateHelpDeskSavedViewSchema.parse(await request.json());
    const actor = await requireDashboardActor(request);
    const workspaceId = await resolveWorkspace(actor, input.filters.botId);
    const view = await prisma.$transaction(async (tx) => {
      if (await tx.helpDeskSavedView.count({ where: { workspaceId } }) >= MAX_SAVED_VIEWS) throw new SavedViewLimitError();
      if (input.isDefault) await tx.helpDeskSavedView.updateMany({ where: { workspaceId }, data: { isDefault: false } });
      return tx.helpDeskSavedView.create({
        data: { ...input, workspaceId, filters: JSON.stringify(input.filters) },
      });
    }, { isolationLevel: 'Serializable' });
    return NextResponse.json({
      success: true,
      data: { ...view, filters: parseHelpDeskSavedViewFilters(view.filters) },
    }, { status: 201 });
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof SavedViewLimitError) {
      return NextResponse.json({ success: false, error: `Puoi salvare al massimo ${MAX_SAVED_VIEWS} viste` }, { status: 409 });
    }
    const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
    if (!duplicate) console.error("Help Desk saved view create failed", error);
    return NextResponse.json({ success: false, error: duplicate ? "Esiste già una vista con questo nome" : "Vista non valida" }, { status: duplicate ? 409 : 400 });
  }
}

class SavedViewLimitError extends Error {}
