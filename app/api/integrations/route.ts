import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { findIntegration, INTEGRATION_CATALOG, safeHttpsUrl } from '@/lib/integration-catalog'

const Schema = z.object({ botId: z.string().uuid(), provider: z.string(), config: z.record(z.string()).default({}), enabled: z.boolean().default(true) })
const parse = (value: string) => { try { return JSON.parse(value) } catch { return {} } }

export async function GET(request: NextRequest) {
  const botId = request.nextUrl.searchParams.get('botId')
  if (!botId) return NextResponse.json({ success: true, data: INTEGRATION_CATALOG.map(definition => ({ ...definition, connection: null })) })
  const connections = await prisma.integrationConnection.findMany({ where: { botId } })
  return NextResponse.json({ success: true, data: INTEGRATION_CATALOG.map(definition => {
    const connection = connections.find(item => item.provider === definition.provider)
    return { ...definition, connection: connection ? { ...connection, config: parse(connection.config) } : null }
  }) })
}

export async function POST(request: NextRequest) {
  try {
    const input = Schema.parse(await request.json()), definition = findIntegration(input.provider)
    if (!definition || definition.mode === 'planned') return NextResponse.json({ success: false, error: 'Questa integrazione richiede ancora il connettore ufficiale.' }, { status: 409 })
    const allowed = new Set((definition.fields || []).map(field => field.key))
    const config = Object.fromEntries(Object.entries(input.config).filter(([key]) => allowed.has(key)))
    for (const field of definition.fields || []) if (!config[field.key] || (field.type === 'url' && !safeHttpsUrl(config[field.key]))) return NextResponse.json({ success: false, error: `${field.label} non valido: usa un URL HTTPS pubblico.` }, { status: 400 })
    const connection = await prisma.$transaction(async tx => {
      if (input.provider === 'widget') await tx.embedSettings.upsert({ where: { chatbotId: input.botId }, create: { chatbotId: input.botId, enabled: input.enabled, title: 'Assistente AI', primaryColor: '#633cff' }, update: { enabled: input.enabled } })
      return tx.integrationConnection.upsert({ where: { botId_provider: { botId: input.botId, provider: input.provider } }, create: { botId: input.botId, provider: input.provider, category: definition.category, displayName: definition.name, config: JSON.stringify(config), status: definition.mode === 'native' ? 'connected' : 'configured', enabled: input.enabled }, update: { config: JSON.stringify(config), enabled: input.enabled, status: definition.mode === 'native' ? 'connected' : 'configured', lastError: null } })
    })
    return NextResponse.json({ success: true, data: { ...connection, config } })
  } catch (error) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Configurazione non valida' }, { status: 400 }) }
}
