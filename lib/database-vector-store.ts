import "server-only";
import { prisma } from "./db";
interface DatabaseVectorDocument {
  id: string;
  text: string;
  embedding: number[];
  metadata: Record<string, unknown>;
}

function cosineSimilarity(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator ? dot / denominator : 0;
}

export async function replaceDatabaseVectors(
  botId: string,
  sourceId: string,
  documents: DatabaseVectorDocument[],
) {
  await prisma.$transaction([
    prisma.knowledgeChunk.deleteMany({ where: { botId, sourceId } }),
    prisma.knowledgeChunk.createMany({
      data: documents.map((document) => ({
        botId,
        sourceId,
        chunkKey: document.id,
        text: document.text,
        embedding: JSON.stringify(document.embedding),
        metadata: JSON.stringify(document.metadata),
      })),
    }),
  ]);
}

export async function searchDatabaseVectors(
  botId: string,
  queryEmbedding: number[],
  topK: number,
  minScore: number,
) {
  const chunks = await prisma.knowledgeChunk.findMany({
    where: { botId },
    select: { id: true, text: true, embedding: true, metadata: true },
    orderBy: { createdAt: "desc" },
    take: 5_000,
  });
  return chunks
    .map((chunk) => {
      let embedding: number[] = [];
      let metadata: Record<string, unknown> = {};
      try { embedding = JSON.parse(chunk.embedding); } catch {}
      try { metadata = JSON.parse(chunk.metadata); } catch {}
      return {
        id: chunk.id,
        text: chunk.text,
        score: cosineSimilarity(queryEmbedding, embedding),
        metadata,
      };
    })
    .filter((chunk) => chunk.score >= minScore)
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
}

export async function deleteDatabaseVectorsForBot(botId: string) {
  await prisma.knowledgeChunk.deleteMany({ where: { botId } });
}

export async function deleteDatabaseVectorsForSource(botId: string, sourceId: string) {
  await prisma.knowledgeChunk.deleteMany({ where: { botId, sourceId } });
}

export async function getDatabaseVectorStats(botId: string) {
  const [documentCount, sources] = await Promise.all([
    prisma.knowledgeChunk.count({ where: { botId } }),
    prisma.knowledgeChunk.groupBy({ by: ["sourceId"], where: { botId } }),
  ]);
  return {
    exists: documentCount > 0,
    documentCount,
    sourceCount: sources.length,
    sources: sources.map((source) => source.sourceId),
  };
}
