import "server-only";
import { prisma } from "@/lib/db";
import { createIngestionJob, JobType } from "@/lib/ingestion-queue";
import { parseJSON } from "@/lib/utils";

export const DEFAULT_KNOWLEDGE_SYNC_DAYS = 7;

function syncDays(settingsValue: string | null) {
  const settings = parseJSON<Record<string, unknown>>(settingsValue) || {};
  const value = Number(settings.knowledgeSyncDays);
  return Number.isInteger(value) && value >= 1 && value <= 365
    ? value
    : DEFAULT_KNOWLEDGE_SYNC_DAYS;
}

function normalizedUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return value.trim();
  }
}

export async function getKnowledgeSyncPreview(botId?: string, activeOnly = false) {
  const agents = await prisma.chatbot.findMany({
    where: {
      ...(botId ? { id: botId } : {}),
      ...(activeOnly ? { isActive: true } : {}),
    },
    select: {
      id: true,
      companyName: true,
      settings: true,
      knowledgeSources: {
        where: {
          sourceType: "url",
          sourceUrl: { not: null },
          status: "completed",
        },
        orderBy: [{ processedAt: "desc" }, { createdAt: "desc" }],
      },
    },
    orderBy: { companyName: "asc" },
  });

  return agents.map((agent) => {
    const days = syncDays(agent.settings);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const latestByUrl = new Map<string, (typeof agent.knowledgeSources)[number]>();
    for (const source of agent.knowledgeSources) {
      const key = normalizedUrl(source.sourceUrl!);
      if (!latestByUrl.has(key)) latestByUrl.set(key, source);
    }
    const sources = [...latestByUrl.values()];
    const staleSources = sources.filter(
      (source) => (source.processedAt || source.createdAt) < cutoff,
    );
    return {
      botId: agent.id,
      companyName: agent.companyName,
      syncDays: days,
      cutoff: cutoff.toISOString(),
      urlSources: sources.length,
      staleSources: staleSources.length,
      oldestSyncAt: sources
        .map((source) => source.processedAt || source.createdAt)
        .sort((a, b) => a.getTime() - b.getTime())[0]
        ?.toISOString() || null,
      candidates: staleSources.map((source) => ({
        sourceId: source.id,
        url: source.sourceUrl!,
        processedAt: (source.processedAt || source.createdAt).toISOString(),
      })),
    };
  });
}

export async function scheduleKnowledgeSync(options: {
  botId?: string;
  limit?: number;
  activeOnly?: boolean;
}) {
  const limit = Math.max(1, Math.min(options.limit || 3, 10));
  const previews = await getKnowledgeSyncPreview(
    options.botId,
    Boolean(options.activeOnly),
  );
  const candidates = previews.flatMap((preview) =>
    preview.candidates.slice(0, 3).map((source) => ({
      ...source,
      botId: preview.botId,
      companyName: preview.companyName,
    })),
  ).slice(0, limit);
  const jobs = [];

  for (const candidate of candidates) {
    const dedupeKey = `knowledge-sync:${candidate.sourceId}:${candidate.processedAt}`;
    const job = await createIngestionJob(
      candidate.botId,
      JobType.URL,
      {
        singleUrl: candidate.url,
        replaceSourceId: candidate.sourceId,
      },
      4,
      { dedupeKey },
    );
    jobs.push({
      id: job.id,
      botId: job.botId,
      companyName: candidate.companyName,
      sourceId: candidate.sourceId,
      url: candidate.url,
      status: job.status,
      dedupeKey,
    });
  }

  return {
    scheduledAt: new Date().toISOString(),
    staleSources: previews.reduce((sum, item) => sum + item.staleSources, 0),
    scheduled: jobs.length,
    jobs,
  };
}
