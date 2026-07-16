import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const body = await request.json()
  const updated = await prisma.integrationConnection.update({ where: { id: params.id }, data: { enabled: Boolean(body.enabled) } })
  return NextResponse.json({ success: true, data: updated })
}
export async function DELETE(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const connection = await prisma.integrationConnection.findUnique({ where: { id: params.id } })
  if (!connection) return NextResponse.json({ success: false, error: 'Connessione non trovata' }, { status: 404 })
  await prisma.$transaction(async tx => {
    if (connection.provider === 'widget') await tx.embedSettings.updateMany({ where: { chatbotId: connection.botId }, data: { enabled: false } })
    await tx.integrationConnection.delete({ where: { id: params.id } })
  })
  return NextResponse.json({ success: true })
}
