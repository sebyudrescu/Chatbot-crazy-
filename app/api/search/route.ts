import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface Result { id: string; type: string; title: string; subtitle: string; href: string }

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim()
  if (!query || query.length < 2) return NextResponse.json({ success: true, data: [] })
  const contains = { contains: query, mode: 'insensitive' as const }
  const [agents, conversations, sources, workflows, actions, integrations] = await Promise.all([
    prisma.chatbot.findMany({ where: { companyName: contains }, take: 6, orderBy: { createdAt: 'desc' } }),
    prisma.conversation.findMany({ where: { OR: [{ userName: contains }, { userEmail: contains }, { userPhone: contains }, { summary: contains }, { messages: { some: { content: contains } } }] }, include: { chatbot: { select: { companyName: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1 } }, take: 6, orderBy: { lastMessageAt: 'desc' } }),
    prisma.knowledgeSource.findMany({ where: { OR: [{ originalFilename: contains }, { sourceUrl: contains }, { contentText: contains }] }, include: { chatbot: { select: { companyName: true } } }, take: 6, orderBy: { createdAt: 'desc' } }),
    prisma.workflow.findMany({ where: { OR: [{ name: contains }, { description: contains }] }, include: { chatbot: { select: { companyName: true } } }, take: 5, orderBy: { updatedAt: 'desc' } }),
    prisma.agentAction.findMany({ where: { OR: [{ name: contains }, { description: contains }, { triggerKeywords: contains }] }, include: { chatbot: { select: { companyName: true } } }, take: 5, orderBy: { updatedAt: 'desc' } }),
    prisma.integrationConnection.findMany({ where: { OR: [{ displayName: contains }, { provider: contains }] }, include: { chatbot: { select: { companyName: true } } }, take: 5, orderBy: { updatedAt: 'desc' } }),
  ])
  const results: Result[] = [
    ...agents.map(item => ({ id: item.id, type: 'Agente', title: item.companyName, subtitle: item.isActive ? 'Agente attivo' : 'Bozza', href: `/chatbot/${item.id}/settings` })),
    ...conversations.map(item => ({ id: item.id, type: 'Conversazione', title: item.userName || item.userEmail || `Visitatore ${item.id.slice(-6)}`, subtitle: `${item.chatbot.companyName} · ${item.messages[0]?.content?.slice(0, 80) || 'Nessun messaggio'}`, href: `/conversations?conversation=${item.id}` })),
    ...sources.map(item => ({ id: item.id, type: 'Fonte', title: item.originalFilename || item.sourceUrl || 'Contenuto manuale', subtitle: `${item.chatbot.companyName} · ${item.status}`, href: '/knowledge' })),
    ...workflows.map(item => ({ id: item.id, type: 'Workflow', title: item.name, subtitle: `${item.chatbot.companyName} · ${item.isActive ? 'Attivo' : 'In pausa'}`, href: '/workflow' })),
    ...actions.map(item => ({ id: item.id, type: 'Azione', title: item.name, subtitle: `${item.chatbot.companyName} · ${item.type}`, href: '/actions' })),
    ...integrations.map(item => ({ id: item.id, type: 'Integrazione', title: item.displayName, subtitle: `${item.chatbot.companyName} · ${item.status}`, href: '/integrations' })),
  ]
  return NextResponse.json({ success: true, data: results.slice(0, 25) })
}
