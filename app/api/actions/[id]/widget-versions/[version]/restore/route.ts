import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  decryptConfigSecrets,
  encryptConfigSecrets,
} from "@/lib/secret-config";
import {
  WidgetDefinitionSchema,
  widgetDefinitionDiff,
  widgetDefinitionFromConfig,
  widgetRemoteUrls,
} from "@/lib/widget-definition";
import { assertSafeHttpsRemoteUrl } from "@/lib/url-safety";

export async function POST(
  _: Request,
  context: { params: Promise<{ id: string; version: string }> },
) {
  const { id, version: rawVersion } = await context.params;
  const version = Number(rawVersion);
  if (!Number.isInteger(version) || version < 1) {
    return NextResponse.json({ success: false, error: "Versione non valida" }, { status: 400 });
  }
  const [action, selected] = await Promise.all([
    prisma.agentAction.findUnique({ where: { id } }),
    prisma.widgetVersion.findUnique({ where: { actionId_version: { actionId: id, version } } }),
  ]);
  if (!action || !selected) return NextResponse.json({ success: false, error: "Versione non trovata" }, { status: 404 });
  const definition = WidgetDefinitionSchema.parse(decryptConfigSecrets(JSON.parse(selected.definition)));
  for (const url of widgetRemoteUrls(definition)) await assertSafeHttpsRemoteUrl(url);
  const config = decryptConfigSecrets(JSON.parse(action.config)) as Record<string, unknown>;
  const previous = widgetDefinitionFromConfig(config);
  const latest = await prisma.widgetVersion.findFirst({ where: { actionId: id }, orderBy: { version: "desc" }, select: { version: true } });
  const restoredConfig = { ...config, template: definition.template === "custom" ? config.template : definition.template, definition };
  const updated = await prisma.$transaction(async (transaction) => {
    const next = await transaction.agentAction.update({
      where: { id },
      data: { config: JSON.stringify(encryptConfigSecrets(restoredConfig)) },
    });
    await transaction.widgetVersion.create({
      data: {
        actionId: id,
        version: (latest?.version || 0) + 1,
        definition: JSON.stringify(encryptConfigSecrets(definition)),
        changeSummary: `Ripristinata v${version} · ${widgetDefinitionDiff(previous, definition).join(" · ")}`,
      },
    });
    return next;
  });
  return NextResponse.json({ success: true, data: { id: updated.id, restoredVersion: version } });
}
