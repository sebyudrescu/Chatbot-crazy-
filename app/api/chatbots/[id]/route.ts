import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseJSON, stringifyJSON } from "@/lib/utils";
import { UpdateChatbotSchema } from "@/lib/types";
import { normalizeAgentSettings } from "@/lib/ai-models";
import { getAgentReadiness } from "@/lib/agent-readiness";
import { deleteKnowledgeBase } from "@/lib/rag-pipeline";
import { dashboardAuthErrorResponse, requireBotPermission, requireDashboardActor } from "@/lib/workspace-auth";

// GET /api/chatbots/[id] - Get a specific chatbot
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  try {
    const actor = await requireDashboardActor(request);
    await requireBotPermission(actor, params.id, "chatbot.read");
    const chatbot = await prisma.chatbot.findUnique({
      where: { id: params.id },
      include: {
        embedSettings: true,
        knowledgeSources: {
          orderBy: { createdAt: "desc" },
        },
        conversations: {
          orderBy: { startedAt: "desc" },
          take: 10,
        },
      },
    });

    if (!chatbot) {
      return NextResponse.json(
        { success: false, error: "Chatbot not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      companyName: chatbot.companyName,
      embedSettings: chatbot.embedSettings,
      data: {
        ...chatbot,
        settings: parseJSON(chatbot.settings),
        promptVariables: parseJSON(chatbot.promptVariables),
      },
    });
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("Error fetching chatbot:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch chatbot" },
      { status: 500 },
    );
  }
}

// PATCH /api/chatbots/[id] - Update a chatbot
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  try {
    const actor = await requireDashboardActor(request);
    await requireBotPermission(actor, params.id, "chatbot.write");
    const body = UpdateChatbotSchema.parse(await request.json());
    const current = await prisma.chatbot.findUnique({
      where: { id: params.id },
    });
    if (!current)
      return NextResponse.json(
        { success: false, error: "Chatbot not found" },
        { status: 404 },
      );

    const updateData: any = {};
    if (body.companyName !== undefined)
      updateData.companyName = body.companyName;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.settings) {
      updateData.settings = stringifyJSON(
        normalizeAgentSettings({
          ...(parseJSON<Record<string, unknown>>(current.settings) || {}),
          ...body.settings,
        }),
      );
    }
    if (body.trialEndDate)
      updateData.trialEndDate = new Date(body.trialEndDate);
    if (body.promptTemplateId !== undefined)
      updateData.promptTemplateId = body.promptTemplateId;
    if (body.systemPrompt !== undefined)
      updateData.systemPrompt = body.systemPrompt;
    if (body.promptVariables !== undefined) {
      updateData.promptVariables = body.promptVariables
        ? stringifyJSON(body.promptVariables)
        : null;
    }

    if (body.isActive === true && !current.isActive) {
      const readiness = await getAgentReadiness(params.id);
      if (!readiness?.ready) {
        return NextResponse.json(
          {
            success: false,
            error: "Completa tutti i controlli prima di pubblicare l’agente.",
            readiness,
          },
          { status: 409 },
        );
      }
    }
    const promptChanged =
      (updateData.systemPrompt !== undefined &&
        updateData.systemPrompt !== current.systemPrompt) ||
      (updateData.promptTemplateId !== undefined &&
        updateData.promptTemplateId !== current.promptTemplateId) ||
      (updateData.settings !== undefined &&
        updateData.settings !== current.settings);
    const chatbot = await prisma.$transaction(async (tx) => {
      const updated = await tx.chatbot.update({
        where: { id: params.id },
        data: updateData,
      });
      if (promptChanged) {
        const latest = await tx.promptVersion.aggregate({
          where: { botId: params.id },
          _max: { version: true },
        });
        const changes = [
          updateData.systemPrompt !== undefined &&
            updateData.systemPrompt !== current.systemPrompt &&
            "system prompt",
          updateData.promptTemplateId !== undefined &&
            updateData.promptTemplateId !== current.promptTemplateId &&
            "template",
          updateData.settings !== undefined &&
            updateData.settings !== current.settings &&
            "impostazioni",
        ].filter(Boolean);
        await tx.promptVersion.create({
          data: {
            botId: params.id,
            version: (latest._max.version || 0) + 1,
            systemPrompt: updated.systemPrompt,
            promptTemplateId: updated.promptTemplateId,
            settings: updated.settings || "{}",
            changeSummary: `Aggiornati: ${changes.join(", ")}`,
          },
        });
      }
      return updated;
    });

    return NextResponse.json({
      success: true,
      data: {
        ...chatbot,
        settings: parseJSON(chatbot.settings),
        promptVariables: parseJSON(chatbot.promptVariables),
      },
    });
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("Error updating chatbot:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update chatbot" },
      { status: 400 },
    );
  }
}

// DELETE /api/chatbots/[id] - Delete a chatbot
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  try {
    const actor = await requireDashboardActor(request);
    await requireBotPermission(actor, params.id, "chatbot.write");
    const chatbot = await prisma.chatbot.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!chatbot) {
      return NextResponse.json(
        { success: false, error: "Agente non trovato" },
        { status: 404 },
      );
    }
    const runningJobs = await prisma.ingestionJob.count({
      where: { botId: params.id, status: "running" },
    });
    if (runningJobs > 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Attendi la fine dell’indicizzazione prima di eliminare l’agente.",
        },
        { status: 409 },
      );
    }
    // Pending jobs are safe to cancel before removing external vectors. A
    // running job is rejected above because it could upload new vectors after
    // the purge and leave customer data orphaned.
    await prisma.ingestionJob.updateMany({
      where: { botId: params.id, status: "pending" },
      data: {
        status: "failed",
        errorMessage: "Agente eliminato prima dell’avvio del job",
        completedAt: new Date(),
      },
    });
    await deleteKnowledgeBase(params.id);
    await prisma.chatbot.delete({
      where: { id: params.id },
    });

    return NextResponse.json({
      success: true,
      message: "Chatbot deleted successfully",
    });
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("Error deleting chatbot:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete chatbot" },
      { status: 400 },
    );
  }
}
