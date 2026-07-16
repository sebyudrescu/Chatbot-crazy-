import 'server-only'
import { prisma } from './db'

interface Candidate { key: string; botId: string; category: string; title: string; description: string; impact: 'high' | 'medium' | 'low'; actionType: string; actionPayload?: Record<string, unknown>; evidence: Record<string, unknown> }

export async function refreshSuggestions() {
  const agents = await prisma.chatbot.findMany({
    include: {
      _count: { select: { knowledgeSources: true, conversations: true, workflows: true, actions: true, integrations: true } },
      evaluationCases: { include: { runs: { orderBy: { createdAt: 'desc' }, take: 1 } } },
      conversations: { where: { OR: [{ needsHumanEscalation: true }, { messages: { some: { feedback: 'negative' } } }] }, select: { id: true, needsHumanEscalation: true, messages: { where: { feedback: 'negative' }, select: { id: true } } } },
      knowledgeSources: { where: { status: 'failed' }, select: { id: true } },
    },
  })
  const candidates: Candidate[] = []
  for (const agent of agents) {
    if (agent._count.knowledgeSources === 0 || agent.kbStatus !== 'ready') candidates.push({ key: `${agent.id}:knowledge`, botId: agent.id, category: 'knowledge', title: `Completa le fonti di ${agent.companyName}`, description: agent._count.knowledgeSources === 0 ? 'L’agente non ha fonti autorizzate: non può rispondere in modo affidabile.' : `La knowledge base risulta “${agent.kbStatus}”. Controlla sincronizzazione ed errori.`, impact: 'high', actionType: 'open_knowledge', evidence: { sources: agent._count.knowledgeSources, kbStatus: agent.kbStatus } })
    if (agent.knowledgeSources.length) candidates.push({ key: `${agent.id}:failed-sources`, botId: agent.id, category: 'knowledge', title: `Risolvi ${agent.knowledgeSources.length} importazioni fallite`, description: 'Alcune fonti non sono disponibili al chatbot e possono causare risposte incomplete.', impact: 'high', actionType: 'open_knowledge', evidence: { failedSources: agent.knowledgeSources.length } })
    const failedTests = agent.evaluationCases.filter(test => test.runs[0] && !test.runs[0].passed)
    if (failedTests.length) candidates.push({ key: `${agent.id}:failed-tests`, botId: agent.id, category: 'prompt', title: `${failedTests.length} regressioni da correggere`, description: 'Le ultime valutazioni automatiche hanno trovato risposte non conformi. Rivedi prompt e fonti prima della consegna.', impact: 'high', actionType: 'open_evaluations', evidence: { failedTests: failedTests.length, cases: failedTests.map(test => test.name) } })
    if (!agent.evaluationCases.length) candidates.push({ key: `${agent.id}:safety-tests`, botId: agent.id, category: 'testing', title: `Aggiungi test di sicurezza a ${agent.companyName}`, description: 'Non esistono controlli automatici per allucinazioni, prompt injection e fallback.', impact: 'high', actionType: 'create_safety_tests', evidence: { cases: 0 } })
    const negative = agent.conversations.reduce((sum, conversation) => sum + conversation.messages.length, 0)
    if (negative) candidates.push({ key: `${agent.id}:negative-feedback`, botId: agent.id, category: 'conversations', title: `${negative} feedback negativi da analizzare`, description: 'Esamina le risposte segnalate per trovare informazioni mancanti o istruzioni ambigue.', impact: negative >= 3 ? 'high' : 'medium', actionType: 'open_negative_feedback', evidence: { negativeFeedback: negative } })
    const handoffs = agent.conversations.filter(item => item.needsHumanEscalation).length
    if (handoffs > 0 && agent._count.workflows === 0) candidates.push({ key: `${agent.id}:handoff-workflow`, botId: agent.id, category: 'workflow', title: 'Automatizza il passaggio a operatore', description: `${handoffs} conversazioni hanno richiesto assistenza umana, ma non esiste un workflow di handoff.`, impact: 'medium', actionType: 'create_handoff_workflow', evidence: { handoffs, workflows: 0 } })
    if (agent._count.actions === 0) candidates.push({ key: `${agent.id}:actions`, botId: agent.id, category: 'automation', title: `Aggiungi un’azione a ${agent.companyName}`, description: 'L’agente risponde ma non può ancora prenotare, raccogliere lead o chiamare servizi esterni.', impact: 'medium', actionType: 'open_actions', evidence: { actions: 0 } })
    if (agent._count.integrations === 0) candidates.push({ key: `${agent.id}:channels`, botId: agent.id, category: 'channels', title: `Collega un canale per ${agent.companyName}`, description: 'Configura almeno widget o pagina pubblica per rendere l’agente utilizzabile dal cliente.', impact: 'medium', actionType: 'open_channels', evidence: { integrations: 0 } })
  }
  await Promise.all(candidates.map(candidate => prisma.improvementSuggestion.upsert({
    where: { key: candidate.key },
    create: { ...candidate, actionPayload: JSON.stringify(candidate.actionPayload || {}), evidence: JSON.stringify(candidate.evidence) },
    update: { title: candidate.title, description: candidate.description, impact: candidate.impact, actionType: candidate.actionType, actionPayload: JSON.stringify(candidate.actionPayload || {}), evidence: JSON.stringify(candidate.evidence) },
  })))
  return candidates.length
}
