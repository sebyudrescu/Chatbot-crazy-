export interface LiveWebResult {
  title: string
  url: string
  text: string
  domain: string
}

function normalizeAllowedDomain(value: string): string | null {
  const candidate = value.trim().toLocaleLowerCase('en').replace(/^https?:\/\//, '').split('/')[0].replace(/:\d+$/, '').replace(/^www\./, '')
  if (!candidate || candidate === 'localhost' || candidate.endsWith('.localhost')) return null
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(candidate)) return null
  return candidate
}

function isAllowedUrl(value: string, domains: string[]) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    const hostname = url.hostname.toLocaleLowerCase('en').replace(/^www\./, '')
    return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
  } catch { return false }
}

export async function searchAuthorizedWeb(params: {
  query: string
  allowedDomains: string[]
  enabled?: boolean
  limit?: number
  apiKey?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}): Promise<{ results: LiveWebResult[]; durationMs: number; creditsUsed?: number; error?: string }> {
  const startedAt = Date.now()
  const domains = [...new Set(params.allowedDomains.map(normalizeAllowedDomain).filter((value): value is string => Boolean(value)))]
  const apiKey = params.apiKey ?? process.env.FIRECRAWL_API_KEY
  if (!params.enabled || !apiKey || !params.query.trim() || !domains.length) return { results: [], durationMs: Date.now() - startedAt }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs ?? 12_000)
  try {
    const response = await (params.fetchImpl ?? fetch)('https://api.firecrawl.dev/v2/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: params.query.slice(0, 500),
        limit: Math.max(1, Math.min(params.limit ?? 3, 5)),
        sources: ['web'],
        includeDomains: domains,
        ignoreInvalidURLs: true,
        timeout: Math.min(params.timeoutMs ?? 12_000, 15_000),
        scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
      }),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Firecrawl search HTTP ${response.status}`)
    const payload = await response.json() as any
    const web = Array.isArray(payload?.data?.web) ? payload.data.web : []
    const results = web.flatMap((item: any) => {
      const url = typeof item?.url === 'string' ? item.url : ''
      if (!isAllowedUrl(url, domains)) return []
      const parsed = new URL(url)
      const text = [item?.description, item?.markdown].filter((value) => typeof value === 'string' && value.trim()).join('\n\n').slice(0, 4_000)
      if (!text) return []
      return [{ title: String(item?.title || parsed.hostname).slice(0, 300), url, text, domain: parsed.hostname }]
    }).slice(0, Math.max(1, Math.min(params.limit ?? 3, 5)))
    return { results, durationMs: Date.now() - startedAt, creditsUsed: Number(payload?.creditsUsed) || undefined }
  } catch (error) {
    return { results: [], durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timeout)
  }
}
