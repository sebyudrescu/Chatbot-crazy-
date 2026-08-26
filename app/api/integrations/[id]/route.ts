import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { unsubscribeMetaConnection } from '@/lib/meta-disconnect'
import { dashboardAuthErrorResponse, requireDashboardActor, requireResourcePermission } from '@/lib/workspace-auth'

const CALENDLY_ACTION_NAME = 'Prenotazione Calendly (automatica)'

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
 try { const params = await props.params;
  const actor=await requireDashboardActor(request);await requireResourcePermission(actor,'integration',params.id,'chatbot.write')
  const body = await request.json()
  const enabled = Boolean(body.enabled)
  const updated = await prisma.$transaction(async tx => {
    const connection = await tx.integrationConnection.update({ where: { id: params.id }, data: { enabled } })
    if (connection.provider === 'calendly') await tx.agentAction.updateMany({ where: { botId: connection.botId, name: CALENDLY_ACTION_NAME }, data: { enabled } })
    return connection
  })
  return NextResponse.json({ success: true, data: updated }) } catch(error){const authResponse=dashboardAuthErrorResponse(error);if(authResponse)return authResponse;return NextResponse.json({success:false,error:'Aggiornamento non riuscito'},{status:400})}
}
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
 try { const params = await props.params;const actor=await requireDashboardActor(request);await requireResourcePermission(actor,'integration',params.id,'chatbot.write')
  const connection = await prisma.integrationConnection.findUnique({ where: { id: params.id } })
  if (!connection) return NextResponse.json({ success: false, error: 'Connessione non trovata' }, { status: 404 })
  const metaUnsubscribe = await unsubscribeMetaConnection(connection)
  await prisma.$transaction(async tx => {
    if (connection.provider === 'widget') await tx.embedSettings.updateMany({ where: { chatbotId: connection.botId }, data: { enabled: false } })
    if (connection.provider === 'calendly') await tx.agentAction.deleteMany({ where: { botId: connection.botId, name: CALENDLY_ACTION_NAME } })
    await tx.integrationConnection.delete({ where: { id: params.id } })
  })
  return NextResponse.json({
    success: true,
    warning: metaUnsubscribe?.attempted && !metaUnsubscribe.success
      ? 'Connessione rimossa da LitX; Meta non ha confermato la rimozione del webhook.'
      : undefined,
  }) } catch(error){const authResponse=dashboardAuthErrorResponse(error);if(authResponse)return authResponse;return NextResponse.json({success:false,error:'Eliminazione non riuscita'},{status:400})}
}
