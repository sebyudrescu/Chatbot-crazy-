import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  ActionFieldsSchema,
  validateActionDefinition,
} from "@/lib/action-schema";
import { decryptConfigSecrets, encryptConfigSecrets, redactSecrets } from "@/lib/secret-config";
import { assertSafeHttpsRemoteUrl, assertSafeRemoteUrl } from "@/lib/url-safety";
import {
  WidgetDefinitionSchema,
  widgetDefinitionDiff,
  widgetDefinitionFromConfig,
  widgetRemoteUrls,
} from "@/lib/widget-definition";

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
  config: redactSecrets(decryptConfigSecrets(parse(item.config, {}))),
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
    const parsedInput = ActionFieldsSchema.parse(await request.json());
    const definition =
      parsedInput.type === "show_widget"
        ? widgetDefinitionFromConfig(parsedInput.config)
        : parsedInput.type === "api_widget"
          ? WidgetDefinitionSchema.parse(parsedInput.config.definition)
          : null;
    const input = definition
      ? { ...parsedInput, config: { ...parsedInput.config, definition } }
      : parsedInput;
    validateActionDefinition(input);
    if (input.type === "webhook" || input.type === "api_request" || input.type === "api_widget") {
      await assertSafeRemoteUrl(String(input.config.url));
    }
    if (definition) {
      for (const url of widgetRemoteUrls(definition)) await assertSafeHttpsRemoteUrl(url);
    }
    const encryptedConfig = encryptConfigSecrets(input.config);
    const action = await prisma.$transaction(async (transaction) => {
      const created = await transaction.agentAction.create({
        data: {
          ...input,
          triggerKeywords: JSON.stringify(input.triggerKeywords),
          config: JSON.stringify(encryptedConfig),
        },
      });
      if (definition) {
        await transaction.widgetVersion.create({
          data: {
            actionId: created.id,
            version: 1,
            definition: JSON.stringify(encryptConfigSecrets(definition)),
            changeSummary: widgetDefinitionDiff(null, definition).join(" · "),
          },
        });
      }
      return created;
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
