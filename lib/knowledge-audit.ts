export interface AuditedSource {
  id: string;
  status: string;
  sourceType: string;
  originalFilename: string | null;
  processedAt: Date | null;
  _count: { chunks: number };
}

/** Operational evidence only: importing text does not verify its truth or retrieval. */
export function buildKnowledgeAudit(sources: AuditedSource[], pendingJobs: number) {
  const items = sources.map((source) => {
    const state = source.status === 'failed' ? 'failed'
      : ['pending', 'processing'].includes(source.status) ? 'processing'
      : source.status === 'completed' && source._count.chunks > 0 ? 'indexed'
      : source.status === 'completed' ? 'empty' : 'unknown';
    return {
      id: source.id,
      name: source.originalFilename || `${source.sourceType} · ${source.id.slice(0, 8)}`,
      state,
      chunks: source._count.chunks,
      processedAt: source.processedAt,
    };
  });
  const count = (state: string) => items.filter(item => item.state === state).length;
  return {
    total: items.length, indexed: count('indexed'), failed: count('failed'),
    processing: count('processing'), empty: count('empty'), unknown: count('unknown'),
    pendingJobs,
    operationallyReady: items.length > 0 && items.every(item => item.state === 'indexed') && pendingJobs === 0,
    semanticCoverage: 'not_assessed' as const,
    contradictions: 'not_assessed' as const,
    items,
  };
}

export type KnowledgeAudit = ReturnType<typeof buildKnowledgeAudit>;
