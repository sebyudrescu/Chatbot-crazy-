import "server-only";
import { prisma } from "./db";

interface Candidate {
  key: string;
  botId: string;
  category: string;
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  actionType: string;
  actionPayload?: Record<string, unknown>;
  evidence: Record<string, unknown>;
}

export async function refreshSuggestions() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [agents, recentAssistantMessages, incompleteProducts, commerceCounts] = await Promise.all([
    prisma.chatbot.findMany({
      include: {
        _count: { select: { knowledgeSources: true, conversations: true, workflows: true, actions: true, integrations: true, products: true } },
        evaluationCases: { include: { runs: { orderBy: { createdAt: "desc" }, take: 1 } } },
        conversations: { where: { OR: [{ needsHumanEscalation: true }, { messages: { some: { feedback: "negative" } } }] }, select: { id: true, needsHumanEscalation: true, messages: { where: { feedback: "negative" }, select: { id: true } } } },
        knowledgeSources: { where: { status: "failed" }, select: { id: true } },
        integrations: { where: { status: "error" }, select: { id: true, displayName: true } },
      },
    }),
    prisma.message.findMany({
      where: { role: "assistant", createdAt: { gte: since } },
      select: { sourcesUsed: true, conversation: { select: { botId: true } } },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }),
    prisma.product.findMany({
      where: { OR: [{ mainImageUrl: null }, { variants: { none: { price: { not: null } } } }] },
      select: { botId: true },
      take: 5000,
    }),
    prisma.commerceEvent.groupBy({
      by: ["botId", "eventType"],
      where: { createdAt: { gte: since }, eventType: { in: ["impression", "click", "add_to_cart", "conversion"] } },
      _count: { _all: true },
    }),
  ]);

  const lowConfidenceByBot = new Map<string, number>();
  for (const message of recentAssistantMessages) {
    try {
      const confidence = JSON.parse(message.sourcesUsed || "{}")?.metadata?.confidence;
      if (typeof confidence === "number" && confidence < 0.55) lowConfidenceByBot.set(message.conversation.botId, (lowConfidenceByBot.get(message.conversation.botId) || 0) + 1);
    } catch {}
  }
  const incompleteByBot = new Map<string, number>();
  for (const product of incompleteProducts) incompleteByBot.set(product.botId, (incompleteByBot.get(product.botId) || 0) + 1);
  const commerceByBot = new Map<string, Record<string, number>>();
  for (const item of commerceCounts) commerceByBot.set(item.botId, { ...(commerceByBot.get(item.botId) || {}), [item.eventType]: item._count._all });

  const candidates: Candidate[] = [];
  for (const agent of agents) {
    if (agent._count.knowledgeSources === 0 || agent.kbStatus !== "ready") candidates.push({ key: `${agent.id}:knowledge`, botId: agent.id, category: "knowledge", title: `Completa le fonti di ${agent.companyName}`, description: agent._count.knowledgeSources === 0 ? "L’agente non ha fonti autorizzate e non può rispondere in modo affidabile." : `La knowledge base risulta “${agent.kbStatus}”. Controlla sincronizzazione ed errori.`, impact: "high", actionType: "open_knowledge", evidence: { sources: agent._count.knowledgeSources, kbStatus: agent.kbStatus } });
    if (agent.knowledgeSources.length) candidates.push({ key: `${agent.id}:failed-sources`, botId: agent.id, category: "knowledge", title: `Risolvi ${agent.knowledgeSources.length} importazioni fallite`, description: "Alcune fonti non sono disponibili al chatbot e possono causare risposte incomplete.", impact: "high", actionType: "open_knowledge", evidence: { failedSources: agent.knowledgeSources.length } });
    const failedTests = agent.evaluationCases.filter(test => test.runs[0] && !test.runs[0].passed);
    if (failedTests.length) candidates.push({ key: `${agent.id}:failed-tests`, botId: agent.id, category: "prompt", title: `${failedTests.length} regressioni da correggere`, description: "Le ultime valutazioni automatiche hanno trovato risposte non conformi. Rivedi prompt e fonti prima della consegna.", impact: "high", actionType: "open_evaluations", evidence: { failedTests: failedTests.length, cases: failedTests.map(test => test.name) } });
    if (!agent.evaluationCases.length) candidates.push({ key: `${agent.id}:safety-tests`, botId: agent.id, category: "testing", title: `Aggiungi test di sicurezza a ${agent.companyName}`, description: "Non esistono controlli automatici per allucinazioni, prompt injection e fallback.", impact: "high", actionType: "create_safety_tests", evidence: { cases: 0 } });
    const negative = agent.conversations.reduce((sum, conversation) => sum + conversation.messages.length, 0);
    if (negative) candidates.push({ key: `${agent.id}:negative-feedback`, botId: agent.id, category: "conversations", title: `${negative} feedback negativi da analizzare`, description: "Esamina le risposte segnalate per trovare informazioni mancanti o istruzioni ambigue.", impact: negative >= 3 ? "high" : "medium", actionType: "open_negative_feedback", evidence: { negativeFeedback: negative } });
    const handoffs = agent.conversations.filter(item => item.needsHumanEscalation).length;
    if (handoffs > 0 && agent._count.workflows === 0) candidates.push({ key: `${agent.id}:handoff-workflow`, botId: agent.id, category: "workflow", title: "Automatizza il passaggio a operatore", description: `${handoffs} conversazioni hanno richiesto assistenza umana, ma non esiste un workflow di handoff.`, impact: "medium", actionType: "create_handoff_workflow", evidence: { handoffs, workflows: 0 } });
    if (agent._count.actions === 0) candidates.push({ key: `${agent.id}:actions`, botId: agent.id, category: "automation", title: `Aggiungi un’azione a ${agent.companyName}`, description: "L’agente risponde ma non può ancora prenotare, raccogliere lead o chiamare servizi esterni.", impact: "medium", actionType: "open_actions", evidence: { actions: 0 } });
    if (agent._count.integrations === 0) candidates.push({ key: `${agent.id}:channels`, botId: agent.id, category: "channels", title: `Collega un canale per ${agent.companyName}`, description: "Configura almeno widget o pagina pubblica per rendere l’agente utilizzabile dal cliente.", impact: "medium", actionType: "open_channels", evidence: { integrations: 0 } });
    if (agent.integrations.length) candidates.push({ key: `${agent.id}:integration-errors`, botId: agent.id, category: "channels", title: `Ripristina ${agent.integrations.length} integrazioni`, description: `Connessioni in errore: ${agent.integrations.map(item => item.displayName).join(", ")}. Alcune azioni possono fallire finché non vengono ripristinate.`, impact: "high", actionType: "open_integrations", evidence: { failedIntegrations: agent.integrations.length } });
    const lowConfidence = lowConfidenceByBot.get(agent.id) || 0;
    if (lowConfidence >= 3) candidates.push({ key: `${agent.id}:low-confidence`, botId: agent.id, category: "prompt", title: `${lowConfidence} risposte a bassa confidenza`, description: "Negli ultimi 30 giorni il motore ha prodotto più risposte sotto la soglia di affidabilità. Aggiungi fonti o correggi il prompt usando le conversazioni reali.", impact: lowConfidence >= 10 ? "high" : "medium", actionType: "open_negative_feedback", evidence: { lowConfidence, periodDays: 30 } });
    const incomplete = incompleteByBot.get(agent.id) || 0;
    if (incomplete) candidates.push({ key: `${agent.id}:incomplete-products`, botId: agent.id, category: "commerce", title: `Completa ${incomplete} prodotti`, description: "Alcuni prodotti non hanno immagine o prezzo verificato e non possono offrire un’esperienza di acquisto professionale.", impact: incomplete >= 10 ? "high" : "medium", actionType: "open_commerce", evidence: { incompleteProducts: incomplete, totalProducts: agent._count.products } });
    const commerce = commerceByBot.get(agent.id) || {};
    const impressions = commerce.impression || 0, clicks = commerce.click || 0, ctr = impressions ? clicks / impressions : 0;
    if (impressions >= 20 && ctr < 0.03) candidates.push({ key: `${agent.id}:low-product-ctr`, botId: agent.id, category: "commerce", title: "Migliora le raccomandazioni prodotto", description: "Le schede vengono visualizzate ma ricevono pochi click. Rivedi immagini, merchandising e pertinenza delle raccomandazioni.", impact: "medium", actionType: "open_commerce", evidence: { impressions, clicks, ctrPercent: Number((ctr * 100).toFixed(1)), periodDays: 30 } });
  }

  await Promise.all(candidates.map(candidate => prisma.improvementSuggestion.upsert({
    where: { key: candidate.key },
    create: { ...candidate, actionPayload: JSON.stringify(candidate.actionPayload || {}), evidence: JSON.stringify(candidate.evidence) },
    update: { title: candidate.title, description: candidate.description, impact: candidate.impact, actionType: candidate.actionType, actionPayload: JSON.stringify(candidate.actionPayload || {}), evidence: JSON.stringify(candidate.evidence) },
  })));
  const activeKeys = candidates.map(candidate => candidate.key);
  await prisma.improvementSuggestion.deleteMany({ where: { status: "pending", ...(activeKeys.length ? { key: { notIn: activeKeys } } : {}) } });
  return candidates.length;
}
