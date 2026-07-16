import 'server-only'
import { prisma } from './db'

function hostname(value: string) {
  try { return new URL(value.includes('://') ? value : `https://${value}`).hostname.toLowerCase() }
  catch { return value.replace(/^https?:\/\//, '').split('/')[0].toLowerCase() }
}

export async function isAllowedWidgetOrigin(botId: string, origin: string | null, appOrigin: string) {
  if (!origin || hostname(origin) === hostname(appOrigin)) return true
  const embed = await prisma.embedSettings.findUnique({ where: { chatbotId: botId }, select: { enabled: true, allowedDomains: true } })
  if (!embed?.enabled) return false
  if (!embed.allowedDomains) return true
  const current = hostname(origin)
  return embed.allowedDomains.split(/[\n,]/).map(value => value.trim()).filter(Boolean).some(value => {
    if (value === '*') return true
    const allowed = hostname(value.replace(/^\*\./, ''))
    return current === allowed || current.endsWith(`.${allowed}`)
  })
}
