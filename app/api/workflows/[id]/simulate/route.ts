import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { WorkflowStepSchema } from "@/lib/workflow-schema";
import { simulateWorkflow } from "@/lib/workflow-simulator";
import { decryptConfigSecrets } from "@/lib/secret-config";
import { dashboardAuthErrorResponse, requireDashboardActor, requireResourcePermission } from "@/lib/workspace-auth";

const RequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  intent: z.string().trim().max(120).optional(),
  sentiment: z.string().trim().max(40).optional(),
  triggerType: z
    .enum(["new_message", "intent", "keyword", "manual"])
    .optional(),
  steps: z.array(WorkflowStepSchema).max(50).optional(),
});

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await props.params;
    const actor = await requireDashboardActor(request);
    await requireResourcePermission(actor, "workflow", id, "chatbot.read");
    const input = RequestSchema.parse(await request.json());
    const workflow = await prisma.workflow.findUnique({ where: { id } });
    if (!workflow) {
      return NextResponse.json(
        { success: false, error: "Workflow non trovato" },
        { status: 404 },
      );
    }
    const steps =
      input.steps ||
      z.array(WorkflowStepSchema).parse(decryptConfigSecrets(JSON.parse(workflow.steps)));
    const data = simulateWorkflow({
      triggerType:
        input.triggerType ||
        (workflow.triggerType as
          | "new_message"
          | "intent"
          | "keyword"
          | "manual"),
      steps,
      message: input.message,
      intent: input.intent,
      sentiment: input.sentiment,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Simulazione non riuscita",
      },
      { status: 400 },
    );
  }
}
