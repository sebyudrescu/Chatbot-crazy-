import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decryptConfigSecrets, redactSecrets } from "@/lib/secret-config";
import { WidgetDefinitionSchema } from "@/lib/widget-definition";
import { dashboardAuthErrorResponse, requireDashboardActor, requireResourcePermission } from "@/lib/workspace-auth";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
  const { id } = await context.params;
  const actor = await requireDashboardActor(request);
  await requireResourcePermission(actor, "action", id, "chatbot.read");
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
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({ success: false, error: "Versioni non disponibili" }, { status: 500 });
  }
}
