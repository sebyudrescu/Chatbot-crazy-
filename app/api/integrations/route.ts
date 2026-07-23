import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { findIntegration, INTEGRATION_CATALOG, safeHttpsUrl } from '@/lib/integration-catalog'
import { decryptConfigSecrets, encryptConfigSecrets, redactSecrets, restoreMaskedSecrets } from '@/lib/secret-config'
import { assertSafeRemoteUrl } from '@/lib/url-safety'
import { metaTokenExpired, parseMetaConnection } from '@/lib/meta-connections'

const Schema = z.object({ botId: z.string().uuid(), provider: z.string(), config: z.record(z.string()).default({}), enabled: z.boolean().default(true) })
const parse = (value: string) => { try { return JSON.parse(value) } catch { return {} } }

export async function GET(request: NextRequest) {
  const botId = request.nextUrl.searchParams.get('botId')
  if (!botId) return NextResponse.json({ success: true, data: INTEGRATION_CATALOG.map(definition => ({ ...definition, connection: null })) })
  const connections = await prisma.integrationConnection.findMany({ where: { botId } })
  return NextResponse.json({ success: true, data: INTEGRATION_CATALOG.map(definition => {
    const connection = connections.find(item => item.provider === definition.provider)
    if (!connection) return { ...definition, connection: null }
    const config = decryptConfigSecrets(parse(connection.config))
    const metaConfig = definition.provider === 'whatsapp' || definition.provider === 'instagram' ? parseMetaConnection(connection.config) : null
    const validMetaConnection = definition.provider === 'whatsapp'
      ? Boolean(config.accessTokenEncrypted && config.phoneNumberId && metaConfig && !metaTokenExpired(metaConfig))
      : definition.provider === 'instagram'
        ? Boolean(config.accessTokenEncrypted && config.instagramAccountId && metaConfig && !metaTokenExpired(metaConfig))
        : true
    return { ...definition, connection: { ...connection, enabled: connection.enabled && validMetaConnection, status: validMetaConnection ? connection.status : 'disconnected', config: redactSecrets(config) } }
  }) })
}

export async function POST(request: NextRequest) {
  try {
    const input = Schema.parse(await request.json()), definition = findIntegration(input.provider)
    if (!definition || definition.mode === 'planned') return NextResponse.json({ success: false, error: 'Questa integrazione richiede ancora il connettore ufficiale.' }, { status: 409 })
    if (input.provider === 'whatsapp' || input.provider === 'instagram') return NextResponse.json({ success: false, error: 'Usa il collegamento ufficiale Meta dalla schermata Canali.' }, { status: 409 })
    const allowed = new Set((definition.fields || []).map(field => field.key))
    const existing = await prisma.integrationConnection.findUnique({ where: { botId_provider: { botId: input.botId, provider: input.provider } } })
    const submitted = Object.fromEntries(Object.entries(input.config).filter(([key]) => allowed.has(key)))
    const existingConfig = decryptConfigSecrets(parse(existing?.config || '{}'))
    const config = restoreMaskedSecrets(submitted, existingConfig)
    const encryptedConfig = encryptConfigSecrets(config)
    for (const field of definition.fields || []) if ((field.required !== false && !config[field.key]) || (field.type === 'url' && config[field.key] && !safeHttpsUrl(config[field.key]))) return NextResponse.json({ success: false, error: `${field.label} non valido: usa un URL HTTPS pubblico.` }, { status: 400 })
    for (const field of definition.fields || []) if (field.type === 'url' && config[field.key]) await assertSafeRemoteUrl(config[field.key])
    if (input.provider === 'webhook' && config.secret && config.secret.length < 16) return NextResponse.json({ success: false, error: 'Il segreto webhook deve contenere almeno 16 caratteri.' }, { status: 400 })
    const connection = await prisma.$transaction(async tx => {
      if (input.provider === 'widget') await tx.embedSettings.upsert({ where: { chatbotId: input.botId }, create: { chatbotId: input.botId, enabled: input.enabled, title: 'Assistente AI', primaryColor: '#633cff' }, update: { enabled: input.enabled } })
      return tx.integrationConnection.upsert({ where: { botId_provider: { botId: input.botId, provider: input.provider } }, create: { botId: input.botId, provider: input.provider, category: definition.category, displayName: definition.name, config: JSON.stringify(encryptedConfig), status: definition.mode === 'native' ? 'connected' : 'configured', enabled: input.enabled }, update: { config: JSON.stringify(encryptedConfig), enabled: input.enabled, status: definition.mode === 'native' ? 'connected' : 'configured', lastError: null } })
    })
    return NextResponse.json({ success: true, data: { ...connection, config: redactSecrets(config) } })
  } catch (error) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Configurazione non valida' }, { status: 400 }) }
}
