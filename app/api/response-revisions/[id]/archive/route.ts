import { NextResponse } from "next/server";
import { archiveResponseRevision } from "@/lib/response-revisions";

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    return NextResponse.json({ success: true, data: await archiveResponseRevision(id) });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Archiviazione Q&A non riuscita" }, { status: 400 });
  }
}
