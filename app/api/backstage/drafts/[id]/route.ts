import { NextResponse } from "next/server";
import { z } from "zod";
import { updateBackstageDraft } from "@/lib/backstage-service";

const Schema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  summary: z.string().trim().min(1).max(1000).optional(),
  payload: z.unknown().optional(),
}).refine(value => Object.keys(value).length > 0, { message: "Nessuna modifica inviata" });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const input = Schema.parse(await request.json());
    return NextResponse.json({ success: true, data: await updateBackstageDraft(id, input) });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Bozza non aggiornata" }, { status: 400 });
  }
}
