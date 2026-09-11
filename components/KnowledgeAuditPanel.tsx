'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import type { KnowledgeAudit } from '@/lib/knowledge-audit';
import { SourceTestDrafts } from '@/components/SourceTestDrafts';

export function KnowledgeAuditPanel({ botId, onTestSaved }: { botId: string; onTestSaved: () => void }) {
  const [data, setData] = useState<KnowledgeAudit | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [sourceId, setSourceId] = useState('');
  const [preview, setPreview] = useState<{ totalChunks: number; chunks: { id: string; text: string; truncated: boolean }[] } | null>(null);
  const [previewError, setPreviewError] = useState('');
  useEffect(() => {
    setPreview(null); setPreviewError('');
    if (!sourceId) return;
    const controller = new AbortController();
    fetch(`/api/chatbots/${botId}/knowledge-audit?sourceId=${encodeURIComponent(sourceId)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error();
        if (!controller.signal.aborted) setPreview(result.data);
      })
      .catch(() => { if (!controller.signal.aborted) setPreviewError('Anteprima non disponibile. Chiudi e riprova.'); });
    return () => controller.abort();
  }, [botId, sourceId, revision]);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError('');
    fetch(`/api/chatbots/${botId}/knowledge-audit`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error('Controllo fonti non disponibile. Riprova.');
        if (!controller.signal.aborted) setData(result.data);
      })
      .catch(() => { if (!controller.signal.aborted) setError('Controllo fonti non disponibile. Riprova.'); });
    return () => controller.abort();
  }, [botId, revision]);
  const labels: Record<string, string> = { indexed: 'Importata', processing: 'In elaborazione', failed: 'Importazione fallita', empty: 'Nessun contenuto indicizzato', unknown: 'Stato da verificare' };
  return <section className="card mt-6 min-w-0 p-5" aria-label="Controllo delle fonti">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-semibold">1. Controlla le informazioni disponibili</h2>
      <Button onClick={() => setRevision(value => value + 1)}>Ricontrolla fonti</Button>
    </div>
    <p className="mt-2 text-sm text-gray-600">Controllo tecnico basato sulle fonti e sui contenuti realmente presenti nel database, valido per qualsiasi settore.</p>
    {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : !data ? <p role="status" className="mt-4 text-sm">Controllo in corso…</p> : <>
      <p className="mt-4 font-medium">{data.operationallyReady ? 'Importazione completata. Ora verifica le risposte.' : 'Le fonti richiedono attenzione prima del collaudo.'}</p>
      <p className="mt-2 text-sm">Fonti totali: {data.total} · Importate: {data.indexed} · Fallite: {data.failed} · In elaborazione: {data.processing} · Senza contenuto: {data.empty} · Lavori in attesa o in corso: {data.pendingJobs}</p>
      {!data.total && <p className="mt-2 text-sm">Non risultano fonti informative. Un eventuale catalogo o tool esterno non viene valutato da questo controllo.</p>}
      <details className="mt-4">
        <summary className="cursor-pointer py-2 text-sm font-medium">Esamina le singole fonti</summary>
        <ul className="max-h-72 overflow-auto divide-y">
          {data.items.map(source => <li key={source.id} className="py-3 text-sm"><p className="break-words font-medium">{source.name}</p><p>{labels[source.state]} · {source.chunks} frammenti presenti</p>{source.chunks > 0 && <button className="mt-2 text-brand-600 underline" onClick={() => setSourceId(source.id)}>Leggi il testo indicizzato: {source.name}</button>}</li>)}
        </ul>
      </details>
    </>}
    {sourceId && <div className="mt-4 rounded-lg border p-4" aria-label="Testo indicizzato">
      <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Testo realmente indicizzato</h3><button className="text-sm underline" onClick={() => setSourceId('')}>Chiudi anteprima</button></div>
      {previewError ? <p role="alert" className="mt-2 text-sm text-red-700">{previewError}</p> : !preview ? <p role="status">Caricamento…</p> : <>
        <p className="mt-2 text-sm text-gray-600">Anteprima dei primi {preview.chunks.length} frammenti su {preview.totalChunks}. Non è una verifica dell’intero documento né della qualità delle risposte.</p>
        <SourceTestDrafts key={`${botId}:${sourceId}:${revision}`} botId={botId} sourceId={sourceId} onSaved={onTestSaved} />
        <div className="mt-3 max-h-80 overflow-auto space-y-3">{preview.chunks.map(chunk => <blockquote key={chunk.id} className="whitespace-pre-wrap break-words rounded bg-gray-50 p-3 text-sm">{chunk.text}{chunk.truncated && <p className="mt-2 font-medium">Estratto limitato a 2.500 caratteri.</p>}</blockquote>)}</div>
      </>}
    </div>}
    <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Non ancora verificati: informazioni mancanti per le domande dei clienti, contraddizioni e capacità di recuperare la fonte giusta. L’importazione non garantisce risposte corrette: servono prove con fonti di riferimento.</p>
    <Link className="mt-4 inline-block text-sm font-semibold text-brand-600 underline" href={`/knowledge?botId=${botId}`}>Apri e correggi le fonti</Link>
  </section>;
}
