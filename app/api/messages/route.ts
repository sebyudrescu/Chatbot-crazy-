import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { CreateMessageSchema } from '@/lib/types'
import { stringifyJSON, parseJSON } from '@/lib/utils'
import { getMetaConnectionForBot } from '@/lib/meta-connections'
import { sendMetaText } from '@/lib/meta-messaging'
import { whatsappServiceWindow } from '@/lib/meta-payloads'
import { syncCRMContactFromConversation } from '@/lib/crm-sync'
import { recordHelpDeskOperatorReply } from '@/lib/helpdesk-operations'
import { dashboardAuthErrorResponse, requireDashboardActor, requireResourcePermission } from '@/lib/workspace-auth'

// POST /api/messages - Create a message
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedData = CreateMessageSchema.parse(body)
    const actor = await requireDashboardActor(request)
    await requireResourcePermission(actor, 'conversation', validatedData.conversationId, 'conversation.write')
    const conversation = await prisma.conversation.findUnique({
      where: { id: validatedData.conversationId },
      include: { messages: { where: { role: 'user' }, orderBy: { createdAt: 'desc' }, take: 1 } },
    })
    if (!conversation) return NextResponse.json({ success: false, error: 'Conversazione non trovata' }, { status: 404 })

    const metaProvider = conversation.channel === 'whatsapp' || conversation.channel === 'instagram' ? conversation.channel : null
    let metaConnection: Awaited<ReturnType<typeof getMetaConnectionForBot>> = null
    if (validatedData.role === 'assistant' && metaProvider) {
      if (!conversation.externalThreadId) return NextResponse.json({ success: false, error: 'Destinatario del canale non disponibile' }, { status: 409 })
      metaConnection = await getMetaConnectionForBot(conversation.botId, metaProvider)
      if (!metaConnection) return NextResponse.json({ success: false, error: `Canale ${metaProvider} non collegato` }, { status: 409 })
      if (metaProvider === 'whatsapp') {
        const window = whatsappServiceWindow(conversation.messages[0]?.createdAt)
        if (!window.open) return NextResponse.json({ success: false, code: 'WHATSAPP_TEMPLATE_REQUIRED', error: 'La finestra WhatsApp di 24 ore è chiusa. Usa un template approvato.', data: window }, { status: 409 })
      }
    }

    const message = await prisma.message.create({
      data: {
        conversationId: validatedData.conversationId,
        role: validatedData.role,
        content: validatedData.content,
        channel: conversation.channel,
        deliveryStatus: metaConnection ? 'pending' : null,
        operatorAuthored: validatedData.role === 'assistant',
        sourcesUsed: validatedData.sourcesUsed
          ? stringifyJSON(validatedData.sourcesUsed)
          : null,
      },
    })

    if (metaConnection && metaProvider && conversation.externalThreadId) {
      try {
        await sendMetaText({ provider: metaProvider, config: metaConnection.config, recipientId: conversation.externalThreadId, text: validatedData.content, messageId: message.id })
      } catch (error) {
        return NextResponse.json({ success: false, code: 'CHANNEL_DELIVERY_FAILED', error: error instanceof Error ? error.message : 'Invio sul canale non riuscito', data: { ...message, deliveryStatus: 'failed' } }, { status: 502 })
      }
    }
    
    // Update conversation lastMessageAt
    await prisma.conversation.update({
      where: { id: validatedData.conversationId },
      data: { lastMessageAt: new Date() },
    })
    if (validatedData.role === 'assistant') {
      await recordHelpDeskOperatorReply({
        botId: conversation.botId,
        conversationId: conversation.id,
        at: message.createdAt,
      })
    }
    await syncCRMContactFromConversation(validatedData.conversationId)
    
    return NextResponse.json(
      {
        success: true,
        data: {
          ...message,
          deliveryStatus: metaConnection ? 'sent' : message.deliveryStatus,
          sourcesUsed: parseJSON(message.sourcesUsed),
        },
      },
      { status: 201 }
    )
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error)
    if (authResponse) return authResponse
    console.error('Error creating message:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create message',
      },
      { status: 400 }
    )
  }
}
