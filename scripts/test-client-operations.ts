import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");
const chat = read("app/api/chat/route.ts");
const channel = read("lib/channel-message-processor.ts");
const analyticsApi = read("app/api/analytics/route.ts");
const analyticsUi = read("app/analytics/page.tsx");
const contactsUi = read("app/contacts/page.tsx");
const contactsApi = read("app/api/contacts/route.ts");
const contactsUpdateApi = read("app/api/contacts/[id]/route.ts");
const conversationsUi = read("app/conversations/page.tsx");
const knowledgeUi = read("app/knowledge/page.tsx");
const dashboardPermissions = read("lib/use-dashboard-permissions.ts");
const assistApi = read("app/api/conversations/[id]/assist/route.ts");
const cloneApi = read("app/api/chatbots/[id]/clone/route.ts");
const importApi = read("app/api/chatbots/import/route.ts");

assert.match(chat, /syncCRMContactFromConversation/);
assert.match(
  chat,
  /function scheduleCRMContactSync\(conversationId: string, evaluationMode: boolean\)/,
);
assert.match(chat, /if \(evaluationMode\) return/);
assert.match(chat, /after\(async \(\) =>/);
assert.equal(
  (
    chat.match(
      /scheduleCRMContactSync\(conversation\.id, Boolean\(body\.evaluationModel\)\)/g,
    ) || []
  ).length,
  2,
);
assert.match(channel, /syncCRMContactFromConversation\(conversation\.id\)/);
assert.match(channel, /CRM sync failed after channel message/);

assert.match(analyticsApi, /prisma\.cRMContact\.count/);
assert.match(analyticsApi, /allowedWorkspaceIds\(actor, 'analytics\.read'\)/);
assert.match(
  analyticsApi,
  /const directBotWhere = accessibleBotIds === null \? \{\} : \{ botId: \{ in: accessibleBotIds \} \}/,
);
assert.match(analyticsApi, /lastInteraction: \{ gte: since \}/);
assert.match(
  analyticsApi,
  /OR: \[\{ email: \{ not: null \} \}, \{ phone: \{ not: null \} \}\]/,
);
assert.match(analyticsUi, /Tutti i clienti/);
assert.match(analyticsUi, /query\.set\(["']botId["'],\s*botId\)/);
assert.match(analyticsApi, /buildCommerceFunnelComparison/);
assert.match(analyticsApi, /buildNoMatchComparison/);
assert.match(analyticsApi, /buildLeadPipeline/);
assert.match(analyticsApi, /buildChannelPerformance/);
assert.match(analyticsApi, /buildActionPerformance/);
assert.match(analyticsApi, /prisma\.actionExecution\.findMany/);
assert.match(
  analyticsApi,
  /action: \{ select: \{ id: true, botId: true, name: true, type: true \} \}/,
);
assert.match(
  analyticsApi,
  /eventType: \{ in: \['impression', 'click', 'add_to_cart', 'checkout', 'conversion'\] \}/,
);
assert.match(analyticsUi, /Funnel commerciale verificato/);
assert.match(analyticsUi, /Ricerche senza risultati/);
assert.match(analyticsUi, /Visitatori e contatti/);
assert.match(analyticsUi, /Performance per canale e azione/);
assert.match(
  analyticsUi,
  /Gli ordini sono attribuiti al canale soltanto con una conversazione\s+verificata/,
);
assert.match(
  analyticsUi,
  /Le performance appariranno dopo l’esecuzione delle azioni/,
);

assert.match(contactsUi, /Visitatori registrati/);
assert.match(contactsUi, /view === ["']kanban["']/);
assert.match(contactsUi, /Esporta CSV/);
assert.match(contactsUi, /Consenso contatto/);
assert.match(contactsUi, /Note interne/);
assert.match(contactsApi, /botId/);
assert.match(contactsUpdateApi, /leadScore|potentialValue/);
assert.match(contactsUpdateApi, /consentStatus/);

assert.match(knowledgeUi, /!searchTerm && canManageKnowledge/);
assert.match(knowledgeUi, /permissions\.isOwner/);
assert.match(knowledgeUi, /Nessun chatbot assegnato/);
assert.match(knowledgeUi, /Elaborazione in corso/);
assert.match(dashboardPermissions, /const \[loaded, setLoaded\]/);
assert.match(
  dashboardPermissions,
  /isClient: account\?\.mode === ["']client["']/,
);

assert.match(conversationsUi, /assignedAgent/);
assert.match(conversationsUi, /Riepilogo AI/);
assert.match(conversationsUi, /Note interne/);
assert.match(conversationsUi, /Correggi e insegna/);
assert.match(assistApi, /mode: z\.enum\(\['summary', 'reply'\]\)/);
assert.match(cloneApi, /conversationTurns: item\.conversationTurns/);
assert.match(cloneApi, /qualityContract: item\.qualityContract/);
assert.match(importApi, /SerializedConversationTurns/);
assert.match(importApi, /conversationQualityContractSchema\.safeParse/);
assert.match(importApi, /conversationTurns: item\.conversationTurns/);
assert.match(importApi, /qualityContract: item\.qualityContract/);

console.log("Client operations: 53 controlli superati");
