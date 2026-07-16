import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const parse = (value: string) => { try { return JSON.parse(value) } catch { return [] } }

export async function GET(request: NextRequest) {
  const botId = request.nextUrl.searchParams.get('botId')
  const conversations = await prisma.conversation.findMany({ where: botId ? { botId } : undefined, include: { chatbot: { select: { id: true, companyName: true } }, _count: { select: { messages: true } } }, orderBy: { lastMessageAt: 'desc' } })
  const groups = new Map<string, typeof conversations>()
  for (const item of conversations) {
    const identity = item.userEmail?.toLowerCase() || item.userPhone?.replace(/\s/g, '') || item.userSessionId
    const key = `${item.botId}:${identity}`
    groups.set(key, [...(groups.get(key) || []), item])
  }
  const metrics = new Map<string, { conversationCount: number; messageCount: number; intents: string[]; needsAttention: boolean; resolved: boolean }>()
  await Promise.all([...groups.entries()].map(async ([groupKey, items]) => {
    const latest = items[0], identityKey = groupKey.slice(latest.botId.length + 1)
    const intents = [...new Set(items.map(item => item.userIntent).filter((value): value is string => Boolean(value)))]
    let score = 10
    if (latest.userEmail) score += 25
    if (latest.userPhone) score += 20
    if (latest.userCompany) score += 15
    if (intents.some(intent => /sales|quote|preventivo|purchase/i.test(intent))) score += 15
    if (items.length > 1) score += 10
    if (items.some(item => item.needsHumanEscalation)) score += 5
    const contact = await prisma.cRMContact.upsert({
      where: { botId_identityKey: { botId: latest.botId, identityKey } },
      create: { botId: latest.botId, identityKey, name: latest.userName, email: latest.userEmail, phone: latest.userPhone, company: latest.userCompany, leadScore: Math.min(100, score), lastConversationId: latest.id, lastInteraction: latest.lastMessageAt || latest.startedAt },
      update: { name: latest.userName || undefined, email: latest.userEmail || undefined, phone: latest.userPhone || undefined, company: latest.userCompany || undefined, leadScore: Math.min(100, score), lastConversationId: latest.id, lastInteraction: latest.lastMessageAt || latest.startedAt },
    })
    metrics.set(contact.id, { conversationCount: items.length, messageCount: items.reduce((sum, item) => sum + item._count.messages, 0), intents, needsAttention: items.some(item => item.needsHumanEscalation && !item.isResolved), resolved: items.every(item => item.isResolved) })
  }))
  const contacts = await prisma.cRMContact.findMany({ where: botId ? { botId } : undefined, include: { chatbot: { select: { id: true, companyName: true } } }, orderBy: { lastInteraction: 'desc' } })
  return NextResponse.json({ success: true, data: contacts.map(contact => ({ ...contact, tags: parse(contact.tags), notes: parse(contact.notes), conversationId: contact.lastConversationId, agent: contact.chatbot, ...(metrics.get(contact.id) || { conversationCount: 0, messageCount: 0, intents: [], needsAttention: false, resolved: false }) })) })
}
