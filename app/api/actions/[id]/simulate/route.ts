import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ActionTypeSchema } from "@/lib/action-schema";
import { simulateAction } from "@/lib/action-simulator";
import { decryptConfigSecrets } from "@/lib/secret-config";
import { dashboardAuthErrorResponse, requireDashboardActor, requireResourcePermission } from "@/lib/workspace-auth";

const RequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  type: ActionTypeSchema.optional(),
  triggerKeywords: z
    .array(z.string().trim().min(1).max(80))
    .min(1)
    .max(20)
    .optional(),
  config: z.record(z.string()).optional(),
});

const parse = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await props.params;
    const actor = await requireDashboardActor(request);
    await requireResourcePermission(actor, "action", id, "chatbot.read");
    const input = RequestSchema.parse(await request.json());
    const action = await prisma.agentAction.findUnique({ where: { id } });
    if (!action) {
      return NextResponse.json(
        { success: false, error: "Azione non trovata" },
        { status: 404 },
      );
    }
    const data = simulateAction({
      type: input.type || ActionTypeSchema.parse(action.type),
      triggerKeywords:
        input.triggerKeywords || parse<string[]>(action.triggerKeywords, []),
      config: input.config || decryptConfigSecrets(parse<Record<string, string>>(action.config, {})),
      message: input.message,
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
