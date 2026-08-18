import { NextRequest, NextResponse } from "next/server";
import { createResponseRevisionDraft, listResponseRevisions } from "@/lib/response-revisions";

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    return NextResponse.json({ success: true, data: await listResponseRevisions(id) });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Lettura revisioni non riuscita" }, { status: 400 });
  }
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const data = await createResponseRevisionDraft(id, await request.json());
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Creazione revisione non riuscita" }, { status: 400 });
  }
}
