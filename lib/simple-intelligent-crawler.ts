/**
 * Simple Intelligent Crawler
 * 
 * Uses basic fetch + Cheerio + BFS algorithm
 * Guaranteed to work and explore all site links
 */

import axios from 'axios'
import * as cheerio from 'cheerio'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import crypto from 'crypto'
import { assertSafeRemoteUrl } from './url-safety'

export interface SimpleCrawlOptions {
  maxPages?: number
  maxDepth?: number
  onProgress?: (current: number, total: number, url: string) => void
}

export interface CrawledPage {
  url: string
  title: string
  textContent: string
  wordCount: number
  quality: number
  depth: number
}

export class SimpleIntelligentCrawler {
  private baseUrl: string
  private baseDomain: string
  private visited = new Set<string>()
  private seenHashes = new Set<string>()
  private queue: Array<{ url: string; depth: number }> = []
  private results: CrawledPage[] = []
  private options: Required<SimpleCrawlOptions>

  constructor(startUrl: string, options: SimpleCrawlOptions = {}) {
    this.baseUrl = this.normalizeUrl(startUrl)
    this.baseDomain = new URL(this.baseUrl).hostname
    this.options = {
      maxPages: options.maxPages ?? 200,
      maxDepth: options.maxDepth ?? 6,
      onProgress: options.onProgress ?? (() => {})
    }
  }

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url)
      // Remove hash and trailing slash
      let normalized = `${parsed.protocol}//${parsed.host}${parsed.pathname}`
      if (normalized.endsWith('/') && parsed.pathname !== '/') {
        normalized = normalized.slice(0, -1)
      }
      return normalized
    } catch {
      return url
    }
  }

  private shouldCrawl(url: string, depth: number): boolean {
    try {
      const parsed = new URL(url)
      
      // 1. Same domain only
      if (parsed.hostname !== this.baseDomain) return false
      
      // 2. Already visited
      if (this.visited.has(url)) return false
      
      // 3. Max depth
      if (depth > this.options.maxDepth) return false
      
      // 4. Exclude patterns
      const excludePatterns = [
        '/login', '/signin', '/signup', '/register', '/auth',
        '/admin', '/wp-admin', '/dashboard',
        '/api/', '/cdn-cgi/',
        '/search', '/tag/', '/category/', '/author/',
        '?', '#',
        '.pdf', '.jpg', '.png', '.gif', '.svg', '.css', '.js', '.xml', '.json'
      ]
      
      if (excludePatterns.some(pattern => url.toLowerCase().includes(pattern))) {
        return false
      }
      
      // 5. Prefer valuable patterns
      const valuablePatterns = [
        '/docs', '/documentation', '/guide', '/help', '/kb', 
        '/wiki', '/tutorial', '/learn', '/support', '/faq'
      ]
      
      const hasValuable = valuablePatterns.some(pattern => 
        url.toLowerCase().includes(pattern)
      )
      
      // Accept if has valuable pattern OR shallow depth
      return hasValuable || depth <= 3
      
    } catch {
      return false
    }
  }

  private extractLinks(html: string, currentUrl: string): string[] {
    const $ = cheerio.load(html)
    const links: string[] = []

    $('a[href]').each((_, element) => {
      const href = $(element).attr('href')
      if (!href) return

      try {
        // Convert relative to absolute
        const absoluteUrl = new URL(href, currentUrl).href
        const normalized = this.normalizeUrl(absoluteUrl)
        
        if (normalized && !links.includes(normalized)) {
          links.push(normalized)
        }
      } catch {
        // Invalid URL, skip
      }
    })

    return links
  }

  private async extractContent(html: string, url: string): Promise<{
    title: string
    textContent: string
  } | null> {
    try {
      // Use advanced content extractor
      const { extractAdvancedContent } = await import('./advanced-content-extractor')
      const extracted = await extractAdvancedContent(html, url)

      if (extracted) {
        console.log(`[Crawler] Advanced extraction: ${extracted.contentType}, quality: ${extracted.quality}`)
        
        // FIX ENCODING ISSUES: Replace common corrupted characters
        let cleanText = extracted.mainContent
          .replace(/�'�/g, '€')  // Fix Euro symbol
          .replace(/�/g, '')     // Remove other corrupted chars
          .replace(/â€™/g, "'")  // Fix apostrophe
          .replace(/â€�/g, '"')  // Fix quotes
          .replace(/Ã¨/g, 'è')   // Fix accented e
          .replace(/Ã©/g, 'é')   // Fix accented e
          .replace(/Ã /g, 'à')   // Fix accented a
          .replace(/Ã¹/g, 'ù')   // Fix accented u
          .replace(/Ã²/g, 'ò')   // Fix accented o
          .normalize('NFC')      // Unicode normalization
        
        return {
          title: extracted.title,
          textContent: cleanText
        }
      }

      return null
    } catch (error) {
      console.error(`[Crawler] Error extracting content from ${url}:`, error)
      return null
    }
  }

  private scoreQuality(text: string): number {
    let score = 0
    const length = text.length

    if (length > 500) score += 30
    if (length > 2000) score += 20
    if (length > 5000) score += 10

    // Has structure
    if (text.includes('\n\n')) score += 10
    if (text.match(/\d+\./g)) score += 10 // Numbered lists
    
    // Noise reduction
    const noiseWords = ['cookie', 'subscribe', 'newsletter', 'advertisement', 'login']
    noiseWords.forEach(word => {
      if (text.toLowerCase().includes(word)) score -= 5
    })

    if (length < 200) return 0

    return Math.max(0, Math.min(100, score))
  }

  private getHash(text: string): string {
    return crypto
      .createHash('sha256')
      .update(text.toLowerCase().replace(/\s+/g, ' '))
      .digest('hex')
  }

  private isDuplicate(text: string): boolean {
    const hash = this.getHash(text)
    if (this.seenHashes.has(hash)) return true
    this.seenHashes.add(hash)
    return false
  }

  async crawl(): Promise<CrawledPage[]> {
    await assertSafeRemoteUrl(this.baseUrl)
    console.log(`[Crawler] Starting crawl from: ${this.baseUrl}`)
    console.log(`[Crawler] Max pages: ${this.options.maxPages}, Max depth: ${this.options.maxDepth}`)

    // Initialize queue
    this.queue = [{ url: this.baseUrl, depth: 0 }]
    this.visited.clear()
    this.seenHashes.clear()
    this.results = []

    // BFS crawling
    while (this.queue.length > 0 && this.visited.size < this.options.maxPages) {
      // Process in batches
      const batchSize = Math.min(5, this.options.maxPages - this.visited.size)
      const batch = this.queue.splice(0, batchSize)

      await Promise.all(
        batch.map(item => this.crawlPage(item.url, item.depth))
      )

      // Small delay to be respectful
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    console.log(`[Crawler] Completed! Crawled ${this.visited.size} pages, kept ${this.results.length} quality pages`)
    
    return this.results
  }

  private async crawlPage(url: string, depth: number): Promise<void> {
    // Skip if already visited
    if (this.visited.has(url)) return
    this.visited.add(url)

    // Progress callback
    this.options.onProgress(this.visited.size, this.options.maxPages, url)

    try {
      console.log(`[Crawler] Fetching [${depth}]: ${url}`)

      // Follow redirects manually so every destination is validated before
      // making the next request. Automatic redirects could otherwise reach a
      // private address before the SSRF guard sees the final URL.
      let currentUrl = url
      let response
      for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
        const safeUrl = await assertSafeRemoteUrl(currentUrl)
        if (safeUrl.hostname !== this.baseDomain) {
          throw new Error('Redirect verso un dominio esterno non consentito')
        }
        response = await axios.get(safeUrl.toString(), {
          timeout: 10000,
          maxRedirects: 0,
          maxContentLength: 5 * 1024 * 1024,
          maxBodyLength: 5 * 1024 * 1024,
          validateStatus: status => status >= 200 && status < 400,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; ChatbotCrawler/1.0)'
          }
        })
        if (response.status < 300) {
          currentUrl = safeUrl.toString()
          break
        }
        const location = response.headers.location
        if (!location) throw new Error('Redirect senza destinazione')
        if (redirectCount === 5) throw new Error('Troppi redirect')
        currentUrl = new URL(location, safeUrl).toString()
        response = undefined
      }
      if (!response) throw new Error('Impossibile completare il redirect')

      const finalUrl = currentUrl
      const contentType = String(response.headers['content-type'] || '').toLowerCase()
      if (contentType && !contentType.includes('text/html')) {
        throw new Error(`Tipo di contenuto non supportato: ${contentType}`)
      }
      const html = response.data

      // Extract links
      const links = this.extractLinks(html, finalUrl)
      console.log(`[Crawler] Found ${links.length} links on ${finalUrl}`)

      // Add valid links to queue
      for (const link of links) {
        if (this.shouldCrawl(link, depth + 1) && !this.visited.has(link)) {
          this.queue.push({ url: link, depth: depth + 1 })
        }
      }

      // Extract content
      const extracted = await this.extractContent(html, finalUrl)
      if (!extracted || !extracted.textContent) {
        console.log(`[Crawler] No content extracted from ${url}`)
        return
      }

      // Score quality
      const quality = this.scoreQuality(extracted.textContent)
      if (quality < 30) {
        console.log(`[Crawler] Low quality (${quality}), skipping: ${url}`)
        return
      }

      // Check duplicate
      if (this.isDuplicate(extracted.textContent)) {
        console.log(`[Crawler] Duplicate content, skipping: ${url}`)
        return
      }

      // Save result
      const page: CrawledPage = {
        url: finalUrl,
        title: extracted.title,
        textContent: extracted.textContent,
        wordCount: extracted.textContent.split(/\s+/).length,
        quality,
        depth
      }

      this.results.push(page)
      console.log(`[Crawler] ✅ Saved: ${url} (quality: ${quality}, words: ${page.wordCount})`)

    } catch (error: any) {
      console.error(`[Crawler] Error crawling ${url}:`, error.message)
    }
  }

  getResults(): CrawledPage[] {
    return this.results
  }

  getStats() {
    const avgQuality = this.results.reduce((sum, p) => sum + p.quality, 0) / this.results.length || 0
    const totalWords = this.results.reduce((sum, p) => sum + p.wordCount, 0)

    return {
      totalPages: this.results.length,
      crawledPages: this.visited.size,
      averageQuality: Math.round(avgQuality),
      totalWords,
      uniquePages: this.results.length
    }
  }
}

/**
 * Simple helper function
 */
export async function crawlWebsite(
  url: string,
  options?: SimpleCrawlOptions
): Promise<CrawledPage[]> {
  const crawler = new SimpleIntelligentCrawler(url, options)
  return await crawler.crawl()
}
