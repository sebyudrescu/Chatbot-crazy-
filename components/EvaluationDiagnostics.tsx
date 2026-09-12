type Metrics = {
  evaluator?: string;
  sourceReference?: { status?: string; semanticAssessment?: string; exactChunkInCandidatePool?: boolean } | null;
  retrieval?: { applicable?: boolean; hitAtK?: number };
  conversationQuality?: { failures?: string[]; dimensions?: { memoryRetention?: number | null; toolRoutingScore?: number | null } };
};

export function EvaluationDiagnostics({ metrics }: { metrics?: Metrics | null }) {
  if (!metrics) return <p className="mt-3 text-xs text-gray-600">Diagnostica non disponibile per questa esecuzione. Non è possibile attribuire il problema a fonti, ricerca o memoria.</p>;
  const source = metrics.sourceReference;
  const quality = metrics.conversationQuality;
  const percent = (value?: number | null) => typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value * 100)}%` : 'Non misurata';
  const retrieval = metrics.retrieval?.applicable === true && typeof metrics.retrieval.hitAtK === 'number'
    ? metrics.retrieval.hitAtK > 0 ? 'Almeno un risultato considerato pertinente nei primi risultati del benchmark.' : 'Nessun risultato considerato pertinente nei primi risultati del benchmark. Ricontrolla domanda e fonti.'
    : 'Non misurata per questo test.';
  return <details className="mt-3 rounded-lg border border-gray-200 p-3 text-xs">
    <summary className="cursor-pointer font-semibold">Cosa è stato verificato e cosa controllare</summary>
    <dl className="mt-3 space-y-3">
      <div><dt className="font-medium">Fonte di riferimento</dt><dd>{source?.status === 'current' ? 'La citazione approvata era ancora presente al momento della valutazione.' : 'Nessuna citazione approvata collegata a questa esecuzione.'}</dd></div>
      <div><dt className="font-medium">Ricerca delle informazioni</dt><dd>{retrieval}</dd>{source && <dd className="mt-1">{source.exactChunkInCandidatePool ? 'Il frammento esatto di riferimento era nel gruppo di candidati del benchmark.' : 'Il frammento esatto non era nel gruppo di candidati: altri frammenti potrebbero contenere informazioni equivalenti.'}</dd>}</div>
      <div><dt className="font-medium">Valutazione del significato</dt><dd>{source?.semanticAssessment === 'not_assessed' ? 'Non eseguita: il solo controllo dei termini non approva questa prova.' : metrics.evaluator && !['deterministic', 'deterministic_fallback', 'unknown'].includes(metrics.evaluator) ? 'Giudizio del modello: è una stima da controllare, non una certificazione.' : 'Solo controlli deterministici; giudizio semantico non disponibile.'}</dd></div>
      <div><dt className="font-medium">Memoria dei vincoli previsti dal test</dt><dd>{percent(quality?.dimensions?.memoryRetention)}</dd></div>
      <div><dt className="font-medium">Uso degli strumenti previsti dal test</dt><dd>{percent(quality?.dimensions?.toolRoutingScore)}</dd></div>
    </dl>
    <p className="mt-3 text-gray-600">Questi segnali descrivono la prova, non identificano automaticamente la causa. La ricerca del benchmark è distinta dai documenti effettivamente usati nella conversazione.</p>
  </details>;
}
