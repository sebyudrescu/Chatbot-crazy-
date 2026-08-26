import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  parseHelpDeskSavedViewFilters,
  UpdateHelpDeskSavedViewSchema,
} from "@/lib/helpdesk-filters";
import {
  DashboardAuthError,
  actorCanAccessWorkspace,
  dashboardAuthErrorResponse,
  requireBotPermission,
  requireDashboardActor,
} from "@/lib/workspace-auth";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const input = UpdateHelpDeskSavedViewSchema.parse(await request.json());
    const actor = await requireDashboardActor(request);
    const existing = await prisma.helpDeskSavedView.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "Vista non trovata" }, { status: 404 });
    if (!actorCanAccessWorkspace(actor, existing.workspaceId, "conversation.write")) throw new DashboardAuthError("Vista non trovata", 404);
    if (input.filters?.botId) {
      const bot = await requireBotPermission(actor, input.filters.botId, "conversation.read");
      if (bot.workspaceId !== existing.workspaceId) throw new DashboardAuthError("Agente non trovato", 404);
    }
    const view = await prisma.$transaction(async (tx) => {
      if (input.isDefault) await tx.helpDeskSavedView.updateMany({ where: { workspaceId: existing.workspaceId, id: { not: id } }, data: { isDefault: false } });
      const { filters, ...fields } = input;
      return tx.helpDeskSavedView.update({
        where: { id },
        data: {
          ...fields,
          ...(filters ? { filters: JSON.stringify(filters) } : {}),
        },
      });
    });
    return NextResponse.json({
      success: true,
      data: { ...view, filters: parseHelpDeskSavedViewFilters(view.filters) },
    });
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
    const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
    if (!duplicate) console.error("Help Desk saved view update failed", error);
    return NextResponse.json({ success: false, error: duplicate ? "Esiste già una vista con questo nome" : "Vista non valida" }, { status: duplicate ? 409 : 400 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const actor = await requireDashboardActor(request);
    const existing = await prisma.helpDeskSavedView.findUnique({ where: { id }, select: { id: true, workspaceId: true } });
    if (!existing || !actorCanAccessWorkspace(actor, existing.workspaceId, "conversation.write")) {
      return NextResponse.json({ success: false, error: "Vista non trovata" }, { status: 404 });
    }
    await prisma.helpDeskSavedView.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({ success: false, error: "Vista non eliminata" }, { status: 400 });
  }
}
