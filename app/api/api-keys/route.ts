import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createAgentApiKey, publicAgentApiKey } from "@/lib/agent-api-keys";

const CreateSchema = z.object({
  botId: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const botId = z.string().uuid().parse(request.nextUrl.searchParams.get("botId"));
    const items = await prisma.agentApiKey.findMany({ where: { botId }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ success: true, data: items.map(publicAgentApiKey) });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Lettura chiavi non riuscita" }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = CreateSchema.parse(await request.json());
    return NextResponse.json({ success: true, data: await createAgentApiKey(data) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Creazione chiave non riuscita" }, { status: 400 });
  }
}
