import { NextResponse } from "next/server";
import { revokeAgentApiKey } from "@/lib/agent-api-keys";

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    return NextResponse.json({ success: true, data: await revokeAgentApiKey(id) });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Revoca non riuscita" }, { status: 400 });
  }
}
