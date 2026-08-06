import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { prisma } from '@/lib/db'

function normalizeHost(value: string) {
  const trimmed = value.trim().replace(/^\*\./, '')
  if (!trimmed) return ''
  try { return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).hostname.toLowerCase() }
  catch { return trimmed.replace(/^https?:\/\//, '').split('/')[0].toLowerCase() }
}

function isDomainAllowed(origin: string | null, allowed: string | null) {
  if (!allowed || !origin) return true
  const originHost = normalizeHost(origin)
  return allowed.split(/[\n,]/).map(value => value.trim()).filter(Boolean).some(value => {
    if (value === '*') return true
    const allowedHost = normalizeHost(value)
    return originHost === allowedHost || originHost.endsWith(`.${allowedHost}`)
  })
}

export async function GET(request: NextRequest) {
  const botId = request.nextUrl.searchParams.get('botId')
  const pageMode = request.nextUrl.searchParams.get('mode') === 'page'
  if (!botId) return NextResponse.json({ error: 'botId parameter is required' }, { status: 400 })

  const chatbot = await prisma.chatbot.findUnique({ where: { id: botId }, include: { embedSettings: true } })
  if (!chatbot) return NextResponse.json({ error: 'Chatbot not found' }, { status: 404 })
  if (!chatbot.isActive) return NextResponse.json({ error: 'Agent not published' }, { status: 403 })
  if (!chatbot.embedSettings?.enabled) return NextResponse.json({ error: 'Widget not enabled' }, { status: 403 })

  const origin = request.headers.get('origin') || request.headers.get('referer')
  if (!pageMode && !isDomainAllowed(origin, chatbot.embedSettings.allowedDomains)) {
    return NextResponse.json({ error: 'Domain not allowed' }, { status: 403 })
  }

  const protocol = request.headers.get('x-forwarded-proto') || request.nextUrl.protocol.replace(':', '') || 'https'
  const host = request.headers.get('host')
  const apiUrl = `${protocol}://${host}`
  const settings = chatbot.embedSettings
  const config = {
    botId,
    apiUrl,
    title: settings.title || chatbot.companyName,
    subtitle: settings.subtitle || 'Come posso aiutarti?',
    theme: settings.theme,
    position: settings.position,
    primaryColor: settings.primaryColor,
    autoOpen: pageMode || settings.autoOpen,
    showLauncher: pageMode ? false : settings.showLauncher,
    displayMode: pageMode ? 'page' : 'floating',
    widgetShape: settings.widgetShape,
    iconType: settings.iconType,
    iconValue: settings.iconValue,
    widgetSize: settings.widgetSize,
    animation: settings.animation,
    shadow: settings.shadow,
    gradient: settings.gradient,
    customCSS: settings.customCSS,
  }

  const widgetPath = path.join(process.cwd(), 'public', 'chatbot-widget.js')
  const widgetScript = fs.readFileSync(widgetPath, 'utf-8')
  const fullScript = `window.ChatbotConfig = Object.assign({}, window.ChatbotConfig || {}, ${JSON.stringify(config)});\n${widgetScript}`
  const response = new NextResponse(fullScript, { status: 200, headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300' } })
  response.headers.set('Access-Control-Allow-Origin', '*')
  return response
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' } })
}
