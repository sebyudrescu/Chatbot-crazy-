import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  parseHelpDeskSavedViewFilters,
  UpdateHelpDeskSavedViewSchema,
} from "@/lib/helpdesk-filters";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const input = UpdateHelpDeskSavedViewSchema.parse(await request.json());
    const existing = await prisma.helpDeskSavedView.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "Vista non trovata" }, { status: 404 });
    if (input.filters?.botId) {
      const bot = await prisma.chatbot.findUnique({ where: { id: input.filters.botId }, select: { id: true } });
      if (!bot) return NextResponse.json({ success: false, error: "Chatbot non trovato" }, { status: 404 });
    }
    const view = await prisma.$transaction(async (tx) => {
      if (input.isDefault) await tx.helpDeskSavedView.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
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
    const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
    if (!duplicate) console.error("Help Desk saved view update failed", error);
    return NextResponse.json({ success: false, error: duplicate ? "Esiste già una vista con questo nome" : "Vista non valida" }, { status: duplicate ? 409 : 400 });
  }
}

export async function DELETE(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const existing = await prisma.helpDeskSavedView.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ success: false, error: "Vista non trovata" }, { status: 404 });
  await prisma.helpDeskSavedView.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
