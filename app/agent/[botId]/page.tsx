import { cache } from 'react'
import type { Metadata } from 'next'
import Script from 'next/script'
import { notFound } from 'next/navigation'
import { Bot, ShieldCheck } from 'lucide-react'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

const getPublicAgent = cache(async (botId: string) => prisma.chatbot.findUnique({
  where: { id: botId },
  select: {
    companyName: true,
    isActive: true,
    embedSettings: {
      select: {
        enabled: true,
        title: true,
        subtitle: true,
        primaryColor: true,
      },
    },
  },
}))

export async function generateMetadata(
  props: { params: Promise<{ botId: string }> },
): Promise<Metadata> {
  const { botId } = await props.params
  const agent = await getPublicAgent(botId)
  if (!agent?.isActive || !agent.embedSettings?.enabled) {
    return { title: 'Assistente non disponibile', robots: { index: false, follow: false } }
  }
  const name = agent.embedSettings.title || agent.companyName
  return {
    title: name,
    description: agent.embedSettings.subtitle || `Chatta con l’assistente di ${agent.companyName}.`,
    robots: { index: false, follow: false },
  }
}

export default async function PublicAgentPage(
  props: { params: Promise<{ botId: string }> },
) {
  const { botId } = await props.params
  const agent = await getPublicAgent(botId)
  if (!agent?.isActive || !agent.embedSettings?.enabled) notFound()

  const name = agent.embedSettings.title || agent.companyName
  const subtitle = agent.embedSettings.subtitle || 'Come posso aiutarti?'
  const color = agent.embedSettings.primaryColor || '#633cff'

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 p-6">
      <section
        role="status"
        aria-live="polite"
        className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-white" style={{ backgroundColor: color }}>
          <Bot className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-xl font-bold text-slate-950">{name}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{subtitle}</p>
        <p className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-slate-400">
          <ShieldCheck className="h-4 w-4" /> Connessione protetta
        </p>
        <noscript>
          <p className="mt-5 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
            Abilita JavaScript per utilizzare la chat.
          </p>
        </noscript>
      </section>
      <Script
        id={`litx-public-agent-${botId}`}
        src={`/api/embed/widget.js?botId=${encodeURIComponent(botId)}&mode=page`}
        strategy="afterInteractive"
      />
    </main>
  )
}
