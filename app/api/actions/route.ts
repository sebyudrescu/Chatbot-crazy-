import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  ActionFieldsSchema,
  validateActionDefinition,
} from "@/lib/action-schema";
import { redactSecrets } from "@/lib/secret-config";
import { assertSafeRemoteUrl } from "@/lib/url-safety";

const parse = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};
const serialize = (item: any) => ({
  ...item,
  triggerKeywords: parse(item.triggerKeywords, []),
  config: redactSecrets(parse(item.config, {})),
});

export async function GET(request: NextRequest) {
  const botId = request.nextUrl.searchParams.get("botId");
  const actions = await prisma.agentAction.findMany({
    where: botId ? { botId } : undefined,
    include: {
      chatbot: { select: { companyName: true } },
      executions: { orderBy: { createdAt: "desc" }, take: 10 },
    },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ success: true, data: actions.map(serialize) });
}

export async function POST(request: NextRequest) {
  try {
    const input = ActionFieldsSchema.parse(await request.json());
    validateActionDefinition(input);
    if (input.type === "webhook") await assertSafeRemoteUrl(input.config.url);
    const action = await prisma.agentAction.create({
      data: {
        ...input,
        triggerKeywords: JSON.stringify(input.triggerKeywords),
        config: JSON.stringify(input.config),
      },
    });
    return NextResponse.json(
      { success: true, data: { ...serialize(action), executions: [] } },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Azione non valida",
      },
      { status: 400 },
    );
  }
}
