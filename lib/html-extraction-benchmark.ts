import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import { extractAdvancedContent } from './advanced-content-extractor'
import { tokenizeForRetrieval } from './bm25'

export type ExtractionProvider = 'litx' | 'readability' | 'firecrawl' | 'trafilatura'

export interface ExtractionCandidate {
  provider: ExtractionProvider
  title?: string
  text: string
  durationMs: number
  error?: string
}

export interface ExtractionBenchmarkResult extends ExtractionCandidate {
  score: number
  wordCount: number
  expectedTermCoverage: number
  noiseRate: number
  duplicateLineRate: number
}

const NOISE_TERMS = ['cookie', 'privacy', 'newsletter', 'subscribe', 'login', 'accedi', 'menu', 'copyright', 'carrello']

export function scoreExtractionCandidate(candidate: ExtractionCandidate, expectedTerms: string[] = []): ExtractionBenchmarkResult {
  const normalized = candidate.text.replace(/\s+/g, ' ').trim()
  const tokens = tokenizeForRetrieval(normalized)
  const lower = normalized.toLocaleLowerCase('it')
  const noiseMatches = NOISE_TERMS.reduce((sum, term) => sum + (lower.match(new RegExp(`\\b${term}\\b`, 'g'))?.length || 0), 0)
  const noiseRate = noiseMatches / Math.max(1, tokens.length)
  const lines = candidate.text.split(/\n+/).map((line) => line.trim().toLocaleLowerCase('it')).filter((line) => line.length > 20)
  const duplicateLineRate = lines.length ? (lines.length - new Set(lines).size) / lines.length : 0
  const expectedTermCoverage = expectedTerms.length
    ? expectedTerms.filter((term) => lower.includes(term.toLocaleLowerCase('it'))).length / expectedTerms.length
    : 1
  const sentenceCount = normalized.split(/[.!?]+/).filter((sentence) => sentence.trim().split(/\s+/).length >= 4).length
  const lengthScore = Math.min(1, tokens.length / 300)
  const structureScore = Math.min(1, sentenceCount / 8)
  const score = Math.max(0, Math.min(1,
    expectedTermCoverage * 0.4
    + lengthScore * 0.25
    + structureScore * 0.2
    + (1 - Math.min(1, noiseRate * 20)) * 0.1
    + (1 - duplicateLineRate) * 0.05,
  ))
  return { ...candidate, text: normalized, score, wordCount: tokens.length, expectedTermCoverage, noiseRate, duplicateLineRate }
}

export async function benchmarkHtmlExtraction(params: {
  html: string
  url: string
  expectedTerms?: string[]
  firecrawl?: { text: string; title?: string; durationMs: number; error?: string }
  trafilatura?: { text: string; title?: string; durationMs: number; error?: string }
}) {
  const candidates: ExtractionCandidate[] = []
  let startedAt = Date.now()
  const litx = await extractAdvancedContent(params.html, params.url)
  candidates.push({ provider: 'litx', title: litx?.title, text: litx?.mainContent || '', durationMs: Date.now() - startedAt, error: litx ? undefined : 'Nessun contenuto valido' })

  startedAt = Date.now()
  try {
    const dom = new JSDOM(params.html, { url: params.url })
    const article = new Readability(dom.window.document).parse()
    candidates.push({ provider: 'readability', title: article?.title || undefined, text: article?.textContent || '', durationMs: Date.now() - startedAt, error: article?.textContent ? undefined : 'Nessun contenuto valido' })
    dom.window.close()
  } catch (error) {
    candidates.push({ provider: 'readability', text: '', durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) })
  }

  if (params.firecrawl) candidates.push({ provider: 'firecrawl', ...params.firecrawl })
  if (params.trafilatura) candidates.push({ provider: 'trafilatura', ...params.trafilatura })
  return candidates.map((candidate) => scoreExtractionCandidate(candidate, params.expectedTerms))
    .sort((left, right) => right.score - left.score || left.durationMs - right.durationMs)
}
