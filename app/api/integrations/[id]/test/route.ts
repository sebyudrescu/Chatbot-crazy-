import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { safeHttpsUrl } from '@/lib/integration-catalog'

export async function POST(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const connection = await prisma.integrationConnection.findUnique({ where: { id: params.id } })
  if (!connection) return NextResponse.json({ success: false, error: 'Connessione non trovata' }, { status: 404 })
  const config = JSON.parse(connection.config || '{}')
  const candidate = connection.provider === 'webhook' ? config.endpoint : connection.provider === 'calendly' ? config.bookingUrl : null
  if (!candidate || !safeHttpsUrl(candidate)) return NextResponse.json({ success: false, error: 'Configurazione HTTPS non valida' }, { status: 400 })
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 6000)
  try {
    const response = await fetch(candidate, { method: 'HEAD', redirect: 'manual', signal: controller.signal })
    const ok = response.status < 500
    await prisma.integrationConnection.update({ where: { id: params.id }, data: { status: ok ? 'connected' : 'error', lastTestedAt: new Date(), lastError: ok ? null : `HTTP ${response.status}` } })
    return NextResponse.json({ success: ok, status: response.status, error: ok ? undefined : `Il servizio ha risposto HTTP ${response.status}` }, { status: ok ? 200 : 502 })
  } catch { await prisma.integrationConnection.update({ where: { id: params.id }, data: { status: 'error', lastTestedAt: new Date(), lastError: 'Servizio non raggiungibile' } }); return NextResponse.json({ success: false, error: 'Servizio non raggiungibile' }, { status: 502 }) }
  finally { clearTimeout(timer) }
}
