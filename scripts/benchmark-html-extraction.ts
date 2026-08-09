import axios from 'axios'
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { assertSafeRemoteUrl } from '../lib/url-safety'
import { benchmarkHtmlExtraction } from '../lib/html-extraction-benchmark'

async function firecrawlExtract(url: string) {
  const startedAt = Date.now()
  if (!process.env.FIRECRAWL_API_KEY) return undefined
  try {
    const response = await axios.post('https://api.firecrawl.dev/v2/scrape', {
      url, formats: ['markdown'], onlyMainContent: true, timeout: 20_000,
    }, { headers: { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}` }, timeout: 25_000 })
    return { text: String(response.data?.data?.markdown || ''), title: response.data?.data?.metadata?.title, durationMs: Date.now() - startedAt }
  } catch (error) {
    return { text: '', durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) }
  }
}

function trafilaturaExtract(html: string) {
  const startedAt = Date.now()
  const options = { input: html, encoding: 'utf8' as const, timeout: 20_000, maxBuffer: 10 * 1024 * 1024 }
  const candidates = [process.env.TRAFILATURA_BIN, 'trafilatura'].filter((value): value is string => Boolean(value))
  if (process.platform === 'win32' && process.env.APPDATA) {
    const pythonRoot = path.join(process.env.APPDATA, 'Python')
    if (existsSync(pythonRoot)) {
      for (const version of readdirSync(pythonRoot)) {
        const executable = path.join(pythonRoot, version, 'Scripts', 'trafilatura.exe')
        if (existsSync(executable)) candidates.unshift(executable)
      }
    }
  }
  let run = spawnSync(candidates[0] || 'trafilatura', ['--no-comments', '--no-tables', '--precision'], options)
  for (const candidate of candidates.slice(1)) {
    if (!run.error && run.status === 0 && run.stdout?.trim()) break
    run = spawnSync(candidate, ['--no-comments', '--no-tables', '--precision'], options)
  }
  if (run.status !== 0 || !run.stdout?.trim()) return { text: '', durationMs: Date.now() - startedAt, error: run.stderr?.trim() || run.error?.message || 'Trafilatura non installata' }
  return { text: run.stdout, durationMs: Date.now() - startedAt }
}

async function main() {
  const url = process.argv[2]
  if (!url) throw new Error('Uso: npm run benchmark:html-extraction -- https://dominio/pagina [termine1 termine2]')
  const safe = await assertSafeRemoteUrl(url)
  const startedAt = Date.now()
  const response = await axios.get(safe.toString(), { timeout: 20_000, maxContentLength: 5 * 1024 * 1024, headers: { 'User-Agent': 'LitX-Extraction-Benchmark/1.0' } })
  const html = String(response.data)
  const [firecrawl, trafilatura] = await Promise.all([firecrawlExtract(safe.toString()), Promise.resolve(trafilaturaExtract(html))])
  const ranking = await benchmarkHtmlExtraction({ html, url: safe.toString(), expectedTerms: process.argv.slice(3), firecrawl, trafilatura })
  console.log(JSON.stringify({ success: true, url: safe.toString(), totalDurationMs: Date.now() - startedAt, winner: ranking[0]?.provider || null, ranking: ranking.map(({ text, ...result }) => result) }, null, 2))
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
