'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { SourceEvidence } from '@/lib/evaluation-source-evidence';

type Draft = { name: string; question: string; expectedKeywords: string[]; sourceEvidence: SourceEvidence };
export function SourceTestDrafts({ botId, sourceId, onSaved }: { botId: string; sourceId: string; onSaved: () => void }) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState<number[]>([]);
  async function prepare() {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/evaluations/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ botId, sourceId }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Preparazione non riuscita.');
      setDrafts(result.data.drafts); setSaved([]);
      setNotice(`Esaminati ${result.data.examinedChunks} frammenti su ${result.data.totalChunks}, fino a 2.500 caratteri ciascuno. ${result.data.drafts.length} bozze disponibili; ${result.data.rejected} scartate perché prive di citazione verificabile.`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Preparazione non riuscita.'); }
    finally { setBusy(false); }
  }
  async function approve(draft: Draft, index: number) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/evaluations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, botId }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Salvataggio non riuscito.');
      setSaved(values => [...values, index]); onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'Salvataggio non riuscito. La bozza è conservata.'); }
    finally { setBusy(false); }
  }
  return <section className="mt-4 space-y-3 border-t pt-4" aria-label="Prove dalla fonte">
    <h3 className="font-semibold">2. Prepara prove da questa fonte</h3>
    <p className="text-sm text-gray-600">L’AI propone domande: verifica che la citazione risponda davvero alla domanda. Non vengono salvate né eseguite finché non le approvi. La verifica automatica dei termini non equivale a una valutazione semantica completa.</p>
    <Button disabled={busy} onClick={prepare}>{busy ? 'Operazione in corso…' : 'Prepara bozze con AI'}</Button>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="text-sm text-gray-600">{notice}</p>}
    {drafts.map((draft, index) => <article key={index} className="space-y-3 rounded-lg border p-3">
      <p className="font-medium">{draft.name}</p>
      <label className="block text-sm">Domanda da provare<textarea className="input mt-1" maxLength={2000} value={draft.question} disabled={busy || saved.includes(index)} onChange={event => setDrafts(values => values.map((value, i) => i === index ? { ...value, question: event.target.value } : value))} /></label>
      <blockquote className="whitespace-pre-wrap break-words rounded bg-gray-50 p-3 text-sm">{draft.sourceEvidence.quote}</blockquote>
      <p className="text-sm">Termini verificati nell’estratto: {draft.expectedKeywords.join(', ')}</p>
      <Button disabled={busy || saved.includes(index) || !draft.question.trim()} onClick={() => approve(draft, index)}>{saved.includes(index) ? 'Approvata e salvata' : 'Confermo l’evidenza e salvo il test'}</Button>
    </article>)}
  </section>;
}
