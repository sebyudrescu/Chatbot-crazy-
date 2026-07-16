import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseJSON } from "@/lib/utils";
import { isAllowedWidgetOrigin } from "@/lib/widget-origin";
import { checkRateLimit, requestClientIp } from "@/lib/rate-limit";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ botId: string; conversationId: string }> },
) {
  const { botId, conversationId } = await props.params;
  const sessionId = request.nextUrl.searchParams.get("sessionId") || "";
  if (
    !z.string().uuid().safeParse(botId).success ||
    !z.string().uuid().safeParse(conversationId).success ||
    !z.string().min(1).max(300).safeParse(sessionId).success
  ) {
    return NextResponse.json(
      { success: false, error: "Sessione non valida" },
      { status: 400 },
    );
  }
  if (
    !(await isAllowedWidgetOrigin(
      botId,
      request.headers.get("origin"),
      request.nextUrl.origin,
    ))
  ) {
    return NextResponse.json(
      { success: false, error: "origin_not_allowed" },
      { status: 403 },
    );
  }
  const rate = checkRateLimit(
    `widget-history:${botId}:${requestClientIp(request.headers)}`,
    30,
    60 * 1000,
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { success: false, error: "rate_limit_exceeded" },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000)),
          ),
        },
      },
    );
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, botId, userSessionId: sessionId },
    include: {
      chatbot: { select: { isActive: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 30 },
    },
  });
  if (!conversation) {
    return NextResponse.json(
      { success: false, error: "Conversazione non trovata" },
      { status: 404 },
    );
  }
  const origin = request.headers.get("origin");
  const externalOrigin =
    origin && new URL(origin).hostname !== request.nextUrl.hostname;
  if (externalOrigin && !conversation.chatbot.isActive) {
    return NextResponse.json(
      { success: false, error: "agent_not_published" },
      { status: 403 },
    );
  }

  const sourceIds = new Set<string>();
  const chronologicalMessages = [...conversation.messages].reverse();
  const parsedMessages = chronologicalMessages.map((message) => {
    const sourceData = parseJSON<{
      sources?: Array<{ sourceId?: string }>;
    }>(message.sourcesUsed);
    const ids = (sourceData?.sources || [])
      .map((source) => source.sourceId)
      .filter((id): id is string => Boolean(id));
    ids.forEach((id) => sourceIds.add(id));
    return { message, ids };
  });
  const sources = sourceIds.size
    ? await prisma.knowledgeSource.findMany({
        where: { id: { in: [...sourceIds] }, botId },
        select: {
          id: true,
          sourceType: true,
          sourceUrl: true,
          originalFilename: true,
        },
      })
    : [];
  const sourceMap = new Map(sources.map((source) => [source.id, source]));

  return NextResponse.json({
    success: true,
    data: {
      conversationId,
      needsHumanEscalation: conversation.needsHumanEscalation,
      isResolved: conversation.isResolved,
      assignedAgent: conversation.assignedAgent,
      messages: parsedMessages.map(({ message, ids }) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
        feedback: message.feedback,
        quickReplies: parseJSON(message.quickReplies) || [],
        ctas: parseJSON(message.ctaData) || [],
        sources: ids
          .map((id) => sourceMap.get(id))
          .filter((source) => Boolean(source)),
      })),
    },
  });
}
