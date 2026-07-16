import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  ActionFieldsSchema,
  ActionTypeSchema,
  validateActionDefinition,
} from "@/lib/action-schema";

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
    validateActionDefinition({
      type: input.type || ActionTypeSchema.parse(current.type),
      config: input.config || parse<Record<string, string>>(current.config, {}),
    });
    const updated = await prisma.agentAction.update({
      where: { id },
      data: {
        ...input,
        triggerKeywords: input.triggerKeywords
          ? JSON.stringify(input.triggerKeywords)
          : undefined,
        config: input.config ? JSON.stringify(input.config) : undefined,
      },
    });
    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        triggerKeywords: parse(updated.triggerKeywords, []),
        config: parse(updated.config, {}),
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
