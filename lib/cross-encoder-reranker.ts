export interface CrossEncoderCandidate {
  id: string
  text: string
  finalScore: number
}

export type CrossEncoderRankedCandidate<T extends CrossEncoderCandidate> = T & {
  crossEncoderScore?: number
}

export interface CrossEncoderResult<T extends CrossEncoderCandidate> {
  documents: Array<CrossEncoderRankedCandidate<T>>
  applied: boolean
  provider: 'jina' | 'local_fallback'
  model: string | null
  durationMs: number
  usageTokens?: number
  error?: string
}

interface JinaRerankResponse {
  model?: string
  usage?: { total_tokens?: number }
  results?: Array<{ index?: number; relevance_score?: number }>
}

function clampScore(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

export async function rerankWithCrossEncoder<T extends CrossEncoderCandidate>(
  query: string,
  candidates: T[],
  options: {
    enabled?: boolean
    apiKey?: string
    endpoint?: string
    model?: string
    timeoutMs?: number
    topK?: number
    fetchImpl?: typeof fetch
  } = {},
): Promise<CrossEncoderResult<T>> {
  const startedAt = Date.now()
  const apiKey = options.apiKey ?? process.env.JINA_API_KEY
  const model = options.model ?? process.env.JINA_RERANK_MODEL ?? 'jina-reranker-v2-base-multilingual'
  const original = candidates.map((candidate) => ({ ...candidate }))

  if (!options.enabled || !apiKey || !query.trim() || candidates.length < 2) {
    return {
      documents: original,
      applied: false,
      provider: 'local_fallback',
      model: null,
      durationMs: Date.now() - startedAt,
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000)
  try {
    const response = await (options.fetchImpl ?? fetch)(
      options.endpoint ?? process.env.JINA_RERANK_URL ?? 'https://api.jina.ai/v1/rerank',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          query: query.slice(0, 4_000),
          documents: candidates.slice(0, 20).map((candidate) => candidate.text.slice(0, 12_000)),
          top_n: Math.min(options.topK ?? candidates.length, candidates.length, 20),
          return_documents: false,
        }),
        signal: controller.signal,
      },
    )

    if (!response.ok) throw new Error(`Jina rerank HTTP ${response.status}`)
    const payload = await response.json() as JinaRerankResponse
    if (!Array.isArray(payload.results) || payload.results.length === 0) {
      throw new Error('Jina rerank response did not contain results')
    }

    const ranked = payload.results.flatMap((result) => {
      const index = result.index
      if (!Number.isInteger(index) || index! < 0 || index! >= candidates.length) return []
      const crossEncoderScore = clampScore(Number(result.relevance_score))
      const candidate = candidates[index!]
      return [{
        ...candidate,
        crossEncoderScore,
        finalScore: crossEncoderScore * 0.75 + clampScore(candidate.finalScore) * 0.25,
      }]
    }).sort((left, right) => right.finalScore - left.finalScore)

    if (!ranked.length) throw new Error('Jina rerank returned invalid result indices')
    return {
      documents: ranked,
      applied: true,
      provider: 'jina',
      model: payload.model || model,
      durationMs: Date.now() - startedAt,
      usageTokens: payload.usage?.total_tokens,
    }
  } catch (error) {
    return {
      documents: original,
      applied: false,
      provider: 'local_fallback',
      model,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timeout)
  }
}
