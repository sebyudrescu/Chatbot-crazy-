import { NextResponse } from "next/server";
import { applyBackstageDraft, rejectBackstageDraft, rollbackBackstageDraft, simulateBackstageDraft } from "@/lib/backstage-service";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; operation: string }> }) {
  try {
    const { id, operation } = await params;
    const data = operation === "apply" ? await applyBackstageDraft(id) : operation === "reject" ? await rejectBackstageDraft(id) : operation === "rollback" ? await rollbackBackstageDraft(id) : operation === "simulate" ? await simulateBackstageDraft(id) : null;
    if (!data) return NextResponse.json({ success: false, error: "Operazione non supportata" }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Backstage] draft operation failed", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Operazione non riuscita" }, { status: 400 });
  }
}
