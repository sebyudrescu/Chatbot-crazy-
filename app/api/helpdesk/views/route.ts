import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  CreateHelpDeskSavedViewSchema,
  parseHelpDeskSavedViewFilters,
} from "@/lib/helpdesk-filters";

const MAX_SAVED_VIEWS = 20;

export async function GET() {
  const views = await prisma.helpDeskSavedView.findMany({
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
  return NextResponse.json({
    success: true,
    data: views.map((view) => ({ ...view, filters: parseHelpDeskSavedViewFilters(view.filters) })),
  });
}

export async function POST(request: NextRequest) {
  try {
    const input = CreateHelpDeskSavedViewSchema.parse(await request.json());
    if (input.filters.botId) {
      const bot = await prisma.chatbot.findUnique({ where: { id: input.filters.botId }, select: { id: true } });
      if (!bot) return NextResponse.json({ success: false, error: "Chatbot non trovato" }, { status: 404 });
    }
    const view = await prisma.$transaction(async (tx) => {
      if (await tx.helpDeskSavedView.count() >= MAX_SAVED_VIEWS) throw new SavedViewLimitError();
      if (input.isDefault) await tx.helpDeskSavedView.updateMany({ data: { isDefault: false } });
      return tx.helpDeskSavedView.create({
        data: { ...input, filters: JSON.stringify(input.filters) },
      });
    }, { isolationLevel: 'Serializable' });
    return NextResponse.json({
      success: true,
      data: { ...view, filters: parseHelpDeskSavedViewFilters(view.filters) },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof SavedViewLimitError) {
      return NextResponse.json({ success: false, error: `Puoi salvare al massimo ${MAX_SAVED_VIEWS} viste` }, { status: 409 });
    }
    const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
    if (!duplicate) console.error("Help Desk saved view create failed", error);
    return NextResponse.json({ success: false, error: duplicate ? "Esiste già una vista con questo nome" : "Vista non valida" }, { status: duplicate ? 409 : 400 });
  }
}

class SavedViewLimitError extends Error {}
