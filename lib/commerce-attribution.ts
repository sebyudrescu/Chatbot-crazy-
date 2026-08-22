import { prisma } from "./db";

export const COMMERCE_ATTRIBUTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const SENSITIVE_KEY = /(?:name|email|phone|address|customer|billing|shipping|postal|password|secret|token|authorization|cookie|card|order.?number)/i;
const SENSITIVE_VALUE = /(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\+?\d(?:[ .()-]?\d){8,}|\b(?:Bearer\s+)?(?:sk|shpat|shpca|shpss)_[A-Za-z0-9_-]{10,}\b|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/i;

export function sanitizeCommerceMetadata(
  metadata: Record<string, string | number | boolean> | undefined,
) {
  const sanitized: Record<string, string | number | boolean> = {};
  for (const [rawKey, rawValue] of Object.entries(metadata || {})) {
    const key = rawKey.trim();
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(key) || SENSITIVE_KEY.test(key)) continue;
    if (typeof rawValue !== "string") {
      sanitized[key] = rawValue;
      continue;
    }
    const value = rawValue.trim().replace(/\s+/g, " ").slice(0, 120);
    if (!value || SENSITIVE_VALUE.test(value)) continue;
    sanitized[key] = value;
  }
  return sanitized;
}

export type CommerceAttribution = {
  status: "attributed" | "unattributed" | "rejected";
  conversationId?: string;
  sessionId?: string;
};

export async function resolveCommerceAttribution(input: {
  botId: string;
  conversationId?: string;
  sessionId?: string;
  now?: Date;
}): Promise<CommerceAttribution> {
  if (!input.conversationId && !input.sessionId) return { status: "unattributed" };
  const cutoff = new Date((input.now || new Date()).getTime() - COMMERCE_ATTRIBUTION_WINDOW_MS);
  const conversation = await prisma.conversation.findFirst({
    where: {
      botId: input.botId,
      ...(input.conversationId ? { id: input.conversationId } : {}),
      ...(input.sessionId ? { userSessionId: input.sessionId } : {}),
      OR: [
        { lastMessageAt: { gte: cutoff } },
        { lastMessageAt: null, startedAt: { gte: cutoff } },
      ],
    },
    orderBy: input.conversationId ? undefined : { startedAt: "desc" },
    select: { id: true, userSessionId: true },
  });
  if (!conversation) return { status: "rejected" };
  return {
    status: "attributed",
    conversationId: conversation.id,
    sessionId: conversation.userSessionId,
  };
}
