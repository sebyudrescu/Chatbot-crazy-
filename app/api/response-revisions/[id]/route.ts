import { NextRequest, NextResponse } from "next/server";
import { updateResponseRevisionDraft } from "@/lib/response-revisions";

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    return NextResponse.json({ success: true, data: await updateResponseRevisionDraft(id, await request.json()) });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Aggiornamento revisione non riuscito" }, { status: 400 });
  }
}
