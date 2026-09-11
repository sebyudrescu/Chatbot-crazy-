'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { WeeklyReport } from '@/lib/weekly-report';

export function WeeklyReportPanel({ botId, botName }: { botId: string; botName: string }) {
  const [data, setData] = useState<WeeklyReport | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError('');
    fetch(`/api/analytics/weekly?botId=${encodeURIComponent(botId)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'Report non disponibile');
        if (!controller.signal.aborted) setData(result.data);
      }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [botId, retry]);
  return <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm" aria-label="Report settimanale">
    <h2 className="text-lg font-semibold">Gli ultimi sette giorni</h2>
    <p className="mt-1 text-sm font-medium">{botName}</p>
    {error ? <div role="alert"><p className="mt-3 text-sm">{error}</p><button className="mt-2 underline" onClick={() => setRetry(value => value + 1)}>Riprova</button></div> : !data ? <p role="status" className="mt-3">Caricamento del report…</p> : <>
      <p className="mt-2 text-xs text-gray-500">{new Date(data.start).toLocaleString('it-IT')} – {new Date(data.end).toLocaleString('it-IT')}</p>
      <p className="mt-4 text-sm"><strong>{data.conversations} conversazioni</strong>, rispetto a {data.previousConversations} nei sette giorni precedenti. {data.changePercent === null ? 'Variazione percentuale non calcolabile: il periodo precedente non aveva chat.' : `Variazione: ${data.changePercent > 0 ? '+' : ''}${data.changePercent}%.`}</p>
      {!data.conversations && <p className="mt-3 text-sm">Nessuna conversazione nel periodo: non ci sono temi o tendenze da riassumere.</p>}
      <h3 className="mt-5 font-semibold">Di cosa si è parlato</h3>
      <p className="mt-1 text-sm text-gray-600">Temi rilevati automaticamente nelle chat, non verificati da una persona. {data.unclassified} conversazioni senza un tema utilizzabile. Le percentuali usano tutte le {data.conversations} chat del periodo; una chat può avere più temi.</p>
      <ul className="mt-3 divide-y">{data.topics.map(topic => <li key={topic.label} className="py-3 text-sm"><p className="break-words font-medium">{topic.label}: {topic.count} chat ({topic.percent}%)</p><details className="mt-1"><summary className="cursor-pointer text-brand-600">Vedi esempi nelle conversazioni</summary><div className="mt-2 flex flex-wrap gap-3">{topic.conversationIds.map((id, index) => <Link key={id} className="underline" href={`/conversations?botId=${botId}&conversation=${id}`}>Esempio {index + 1}</Link>)}</div></details></li>)}</ul>
      <p className="mt-4 text-sm">Richieste al team ancora aperte nelle chat iniziate in questi sette giorni: <strong>{data.attention.length}</strong>.</p>
      <p className="mt-3 text-xs text-gray-500">Esclusi {data.excludedTests} test riconoscibili nei due periodi. Le altre chat non sono necessariamente persone uniche o clienti reali. Questo report non misura vendite né garantisce la correttezza delle risposte.</p>
    </>}
  </section>;
}
