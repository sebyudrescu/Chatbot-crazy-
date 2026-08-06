'use client'

import { useState } from 'react'
import Script from 'next/script'
import { Bot, ShieldCheck } from 'lucide-react'

export function PublicAgentExperience({ botId }: { botId: string }) {
  const [unavailable, setUnavailable] = useState(false)

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 p-6">
      <section
        role="status"
        aria-live="polite"
        className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white">
          <Bot className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-xl font-bold text-slate-950">
          {unavailable ? 'Assistente non disponibile' : 'Apertura assistente…'}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {unavailable
            ? 'Questo assistente non è attivo o non è stato pubblicato.'
            : 'Stiamo preparando la conversazione protetta.'}
        </p>
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
        onError={() => setUnavailable(true)}
      />
    </main>
  )
}
