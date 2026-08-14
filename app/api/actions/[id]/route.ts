import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  ActionFieldsSchema,
  ActionTypeSchema,
  validateActionDefinition,
} from "@/lib/action-schema";
import { decryptConfigSecrets, encryptConfigSecrets, redactSecrets, restoreMaskedSecrets } from "@/lib/secret-config";
import { assertSafeHttpsRemoteUrl, assertSafeRemoteUrl } from "@/lib/url-safety";
import {
  WidgetDefinitionSchema,
  widgetDefinitionDiff,
  widgetDefinitionFromConfig,
  widgetRemoteUrls,
} from "@/lib/widget-definition";

const UpdateSchema = ActionFieldsSchema.omit({
  botId: true,
}).partial();
const parse = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  try {
    const input = UpdateSchema.parse(await request.json());
    const current = await prisma.agentAction.findUnique({ where: { id } });
    if (!current) {
      return NextResponse.json(
        { success: false, error: "Azione non trovata" },
        { status: 404 },
      );
    }
    const currentConfig = decryptConfigSecrets(parse<Record<string, unknown>>(current.config, {}));
    const nextConfig = input.config
      ? restoreMaskedSecrets(input.config, currentConfig)
      : currentConfig;
    const nextType = input.type || ActionTypeSchema.parse(current.type);
    const nextDefinition =
      nextType === "show_widget"
        ? widgetDefinitionFromConfig(nextConfig)
        : nextType === "api_widget"
          ? WidgetDefinitionSchema.parse(nextConfig.definition)
          : null;
    const normalizedConfig = nextDefinition
      ? { ...nextConfig, definition: nextDefinition }
      : nextConfig;
    validateActionDefinition({
      type: nextType,
      config: normalizedConfig,
    });
    if (nextType === "webhook" || nextType === "api_request" || nextType === "api_widget") {
      await assertSafeRemoteUrl(String(normalizedConfig.url));
    }
    if (nextDefinition) for (const url of widgetRemoteUrls(nextDefinition)) await assertSafeHttpsRemoteUrl(url);
    const previousDefinition =
      current.type === "show_widget" || current.type === "api_widget"
        ? widgetDefinitionFromConfig(currentConfig)
        : null;
    const updated = await prisma.$transaction(async (transaction) => {
      const action = await transaction.agentAction.update({
        where: { id },
        data: {
          ...input,
          triggerKeywords: input.triggerKeywords
            ? JSON.stringify(input.triggerKeywords)
            : undefined,
          config: input.config || nextDefinition
            ? JSON.stringify(encryptConfigSecrets(normalizedConfig))
            : undefined,
        },
      });
      if (nextDefinition && widgetDefinitionDiff(previousDefinition, nextDefinition)[0] !== "Nessuna modifica funzionale") {
        const latest = await transaction.widgetVersion.findFirst({ where: { actionId: id }, orderBy: { version: "desc" }, select: { version: true } });
        await transaction.widgetVersion.create({
          data: {
            actionId: id,
            version: (latest?.version || 0) + 1,
            definition: JSON.stringify(encryptConfigSecrets(nextDefinition)),
            changeSummary: widgetDefinitionDiff(previousDefinition, nextDefinition).join(" · "),
          },
        });
      }
      return action;
    });
    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        triggerKeywords: parse(updated.triggerKeywords, []),
        config: redactSecrets(decryptConfigSecrets(parse(updated.config, {}))),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Aggiornamento non riuscito",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  await prisma.agentAction.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
