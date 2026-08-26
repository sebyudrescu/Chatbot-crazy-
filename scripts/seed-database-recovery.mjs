import { PrismaClient } from "@prisma/client";

if (process.env.CI !== "true" || process.env.DR_RECOVERY_SEED !== "true") {
  throw new Error("Il seed recovery può essere eseguito solo nella CI isolata");
}

const prisma = new PrismaClient();
const botId = "dr-evidence-bot";

try {
  await prisma.$transaction(async tx => {
    await tx.chatbot.create({ data: { id: botId, workspaceId: "00000000-0000-4000-8000-000000000001", companyName: "LitX DR Evidence", kbStatus: "ready", kbTotalChunks: 1 } });
    await tx.knowledgeSource.create({
      data: { id: "dr-source", botId, sourceType: "manual", contentText: "Recovery evidence", status: "completed", chunkCount: 1 },
    });
    await tx.knowledgeChunk.create({
      data: { id: "dr-chunk", botId, sourceId: "dr-source", chunkKey: "dr-evidence", text: "Recovery evidence", embedding: "[0]" },
    });
    await tx.conversation.create({ data: { id: "dr-conversation", botId, userSessionId: "dr-session" } });
    await tx.message.create({ data: { id: "dr-message", conversationId: "dr-conversation", role: "user", content: "Recovery evidence" } });
    await tx.integrationConnection.create({
      data: { id: "dr-integration", botId, provider: "dr-test", category: "test", displayName: "DR Evidence" },
    });
    await tx.product.create({
      data: { id: "dr-product", botId, identityKey: "dr-product", canonicalUrl: "https://example.invalid/dr-product", title: "DR Product" },
    });
    await tx.productVariant.create({ data: { id: "dr-variant", productId: "dr-product", identityKey: "dr-variant", sku: "DR-1" } });
    await tx.workflow.create({ data: { id: "dr-workflow", botId, name: "DR Evidence" } });
    await tx.event.create({ data: { id: "dr-event", botId, eventType: "system.dr.evidence", category: "system", severity: "info" } });
  });
  console.log(JSON.stringify({ success: true, botId, records: 10 }));
} finally {
  await prisma.$disconnect();
}
