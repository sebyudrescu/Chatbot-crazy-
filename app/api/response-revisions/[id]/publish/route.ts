import { NextResponse } from "next/server";
import { publishResponseRevision } from "@/lib/response-revisions";

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    return NextResponse.json({ success: true, data: await publishResponseRevision(id) });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Pubblicazione Q&A non riuscita" }, { status: 400 });
  }
}
