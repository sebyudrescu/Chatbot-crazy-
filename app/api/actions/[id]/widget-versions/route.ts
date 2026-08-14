import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decryptConfigSecrets, redactSecrets } from "@/lib/secret-config";
import { WidgetDefinitionSchema } from "@/lib/widget-definition";

export async function GET(
  _: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const action = await prisma.agentAction.findUnique({ where: { id }, select: { id: true } });
  if (!action) return NextResponse.json({ success: false, error: "Widget non trovato" }, { status: 404 });
  const versions = await prisma.widgetVersion.findMany({
    where: { actionId: id },
    orderBy: { version: "desc" },
  });
  return NextResponse.json({
    success: true,
    data: versions.map((version) => ({
      ...version,
      definition: redactSecrets(
        WidgetDefinitionSchema.parse(
          decryptConfigSecrets(JSON.parse(version.definition)),
        ),
      ),
    })),
  });
}
