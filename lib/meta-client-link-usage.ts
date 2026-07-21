import "server-only";
import { prisma } from "@/lib/db";
import type { MetaClientLinkPayload } from "@/lib/meta-client-link";

export async function assertMetaClientLinkUnused(
  link: Pick<MetaClientLinkPayload, "botId" | "provider" | "issuedAt">,
) {
  const connection = await prisma.integrationConnection.findUnique({
    where: { botId_provider: { botId: link.botId, provider: link.provider } },
    select: { config: true },
  });
  if (!connection) return;

  let connectedAt = "";
  try {
    connectedAt = String((JSON.parse(connection.config) as { connectedAt?: unknown }).connectedAt || "");
  } catch {
    return;
  }
  const connectedAtMs = Date.parse(connectedAt);
  if (Number.isFinite(connectedAtMs) && connectedAtMs >= link.issuedAt) {
    throw new Error("Questo link è già stato utilizzato. Chiedi un nuovo link per cambiare account.");
  }
}
