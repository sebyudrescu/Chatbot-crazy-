/**
 * Intelligent Web Crawler
 * 
 * Features:
 * - BFS crawling with smart filtering
 * - Batch processing (5 concurrent)
 * - Content quality scoring
 * - Duplicate detection
 * - Mozilla Readability integration
 * - Progress tracking
 */

import { CheerioCrawler, Dataset } from 'crawlee'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import crypto from 'crypto'

export interface CrawlOptions {
  maxPages?: number
  maxDepth?: number
  batchSize?: number
  includePatterns?: string[]
  excludePatterns?: string[]
  onProgress?: (progress: CrawlProgress) => void
}

export interface CrawlProgress {
  crawled: number
  total: number
  currentUrl: string
  status: 'crawling' | 'processing' | 'completed' | 'error'
}

export interface CrawledPage {
  url: string
  title: string
  content: string
  textContent: string
  excerpt: string
  wordCount: number
  quality: number
  hash: string
  links: string[]
  depth: number
}

export class IntelligentCrawler {
  private baseUrl: string
  private options: Required<CrawlOptions>
  private seenHashes = new Set<string>()
  private results: CrawledPage[] = []

  constructor(baseUrl: string, options: CrawlOptions = {}) {
    this.baseUrl = this.normalizeUrl(baseUrl)
    this.options = {
      maxPages: options.maxPages || 100,
      maxDepth: options.maxDepth || 5,
      batchSize: options.batchSize || 5,
      includePatterns: options.includePatterns || [
        '/docs', '/documentation', '/guide', '/help', '/kb', '/wiki', '/tutorial'
      ],
      excludePatterns: options.excludePatterns || [
        '/login', '/signup', '/register', '/admin', '/api/', '/search', 
        '/tag/', '/category/', '?', '#', '.pdf', '.jpg', '.png', '.gif', 
        '.css', '.js', '/cdn-cgi/', '/wp-admin/'
      ],
      onProgress: options.onProgress || (() => {}),
    }
  }

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url)
      return `${parsed.protocol}//${parsed.hostname}${parsed.pathname === '/' ? '' : parsed.pathname}`
    } catch {
      return url
    }
  }

  /**
   * Smart URL filtering - decides if URL should be crawled
   */
  private shouldCrawlUrl(url: string): boolean {
    try {
      const parsed = new URL(url)
      const fullUrl = parsed.href

      // 1. Must be same domain
      if (!fullUrl.startsWith(this.baseUrl)) return false

      // 2. Check exclude patterns
      if (this.options.excludePatterns.some(pattern => fullUrl.includes(pattern))) {
        return false
      }

      // 3. Check depth
      const depth = parsed.pathname.split('/').filter(p => p).length
      if (depth > this.options.maxDepth) return false

      // 4. Prefer include patterns
      const hasIncludePattern = this.options.includePatterns.some(pattern => 
        fullUrl.includes(pattern)
      )

      // 5. Accept if has include pattern OR is shallow enough
      return hasIncludePattern || depth <= 3

    } catch {
      return false
    }
  }

  /**
   * Extract clean content using Mozilla Readability
   */
  private extractContent(html: string, url: string): {
    title: string
    textContent: string
    excerpt: string
    content: string
  } | null {
    try {
      const dom = new JSDOM(html, { url })
      const reader = new Readability(dom.window.document)
      const article = reader.parse()

      if (!article) {
        // Fallback: extract text from body
        const bodyText = dom.window.document.body?.textContent || ''
        return {
          title: dom.window.document.title || 'Untitled',
          textContent: bodyText.trim(),
          excerpt: bodyText.substring(0, 200).trim(),
          content: bodyText
        }
      }

      return {
        title: article.title || '',
        textContent: article.textContent || '',
        excerpt: article.excerpt || article.textContent?.substring(0, 200) || '',
        content: article.content || ''
      }
    } catch (error) {
      console.error('Error extracting content:', error)
      return null
    }
  }

  /**
   * Calculate content quality score (0-100)
   */
  private scoreContent(text: string): number {
    let score = 0
    const length = text.length

    // Length scoring
    if (length > 500) score += 30
    if (length > 2000) score += 20
    if (length > 5000) score += 10

    // Structure indicators
    if (text.includes('\n\n')) score += 10 // Paragraphs
    if (text.match(/#{1,6}\s/g)) score += 15 // Headers
    if (text.match(/^[-*]\s/gm)) score += 10 // Lists
    if (text.includes('```')) score += 15 // Code blocks

    // Noise indicators (reduce score)
    const noiseWords = ['cookie', 'subscribe', 'newsletter', 'advertisement']
    noiseWords.forEach(word => {
      if (text.toLowerCase().includes(word)) score -= 5
    })

    // Minimum length threshold
    if (length < 200) return 0

    return Math.max(0, Math.min(100, score))
  }

  /**
   * Generate content hash for deduplication
   */
  private generateHash(text: string): string {
    return crypto
      .createHash('sha256')
      .update(text.toLowerCase().replace(/\s+/g, ' ').trim())
      .digest('hex')
  }

  /**
   * Check if content is duplicate
   */
  private isDuplicate(text: string): boolean {
    const hash = this.generateHash(text)
    if (this.seenHashes.has(hash)) return true
    this.seenHashes.add(hash)
    return false
  }

  /**
   * Main crawl method
   */
  async crawl(): Promise<CrawledPage[]> {
    this.results = []
    this.seenHashes.clear()

    let crawledCount = 0
    let queuedCount = 0
    const self = this // Capture reference to IntelligentCrawler instance

    const crawler = new CheerioCrawler({
      maxRequestsPerCrawl: this.options.maxPages,
      maxConcurrency: this.options.batchSize,
      
      async requestHandler({ request, $, enqueueLinks }) {
        const url = request.url
        const depth = request.userData.depth || 0

        // Progress update
        crawledCount++
        if (self.options.onProgress) {
          self.options.onProgress({
            crawled: crawledCount,
            total: Math.min(queuedCount, self.options.maxPages),
            currentUrl: url,
            status: 'crawling'
          })
        }

        console.log(`[Crawler] Processing: ${url} (depth: ${depth})`)

        // Extract content
        const html = $.html()
        const extracted = self.extractContent(html, url)

        if (!extracted || !extracted.textContent) {
          console.log(`[Crawler] Skipped (no content): ${url}`)
          return
        }

        // Check quality
        const quality = self.scoreContent(extracted.textContent)
        if (quality < 30) {
          console.log(`[Crawler] Skipped (low quality: ${quality}): ${url}`)
          return
        }

        // Check duplicates
        if (self.isDuplicate(extracted.textContent)) {
          console.log(`[Crawler] Skipped (duplicate): ${url}`)
          return
        }

        // Extract links
        const links: string[] = []
        $('a[href]').each((_, el) => {
          const href = $(el).attr('href')
          if (href) {
            try {
              const absoluteUrl = new URL(href, url).href
              links.push(absoluteUrl)
            } catch {}
          }
        })

        // Save result
        const page: CrawledPage = {
          url,
          title: extracted.title,
          content: extracted.content,
          textContent: extracted.textContent,
          excerpt: extracted.excerpt,
          wordCount: extracted.textContent.split(/\s+/).length,
          quality,
          hash: self.generateHash(extracted.textContent),
          links: links.slice(0, 50), // Limit links
          depth
        }

        self.results.push(page)

        // Enqueue new links (if not max depth)
        if (depth < self.options.maxDepth) {
          await enqueueLinks({
            selector: 'a[href]',
            userData: { depth: depth + 1 },
            transformRequestFunction: (req) => {
              queuedCount++
              // Filter URLs
              if (!self.shouldCrawlUrl(req.url)) {
                return false
              }
              return req
            }
          })
        }
      },

      failedRequestHandler({ request, error }) {
        console.error(`[Crawler] Failed: ${request.url}`, error)
        if (self.options.onProgress) {
          self.options.onProgress({
            crawled: crawledCount,
            total: self.options.maxPages,
            currentUrl: request.url,
            status: 'error'
          })
        }
      },
    })

    // Start crawling
    await crawler.run([this.baseUrl])

    // Final progress
    this.options.onProgress({
      crawled: this.results.length,
      total: this.results.length,
      currentUrl: '',
      status: 'completed'
    })

    console.log(`[Crawler] Completed! Pages: ${this.results.length}`)
    return this.results
  }

  /**
   * Get results
   */
  getResults(): CrawledPage[] {
    return this.results
  }

  /**
   * Get statistics
   */
  getStats() {
    const avgQuality = this.results.reduce((sum, p) => sum + p.quality, 0) / this.results.length
    const totalWords = this.results.reduce((sum, p) => sum + p.wordCount, 0)

    return {
      totalPages: this.results.length,
      averageQuality: Math.round(avgQuality),
      totalWords,
      uniqueHashes: this.seenHashes.size,
      depthDistribution: this.getDepthDistribution()
    }
  }

  private getDepthDistribution(): Record<number, number> {
    const dist: Record<number, number> = {}
    this.results.forEach(page => {
      dist[page.depth] = (dist[page.depth] || 0) + 1
    })
    return dist
  }
}

/**
 * Quick crawl helper function
 */
export async function crawlWebsite(
  url: string,
  options?: CrawlOptions
): Promise<CrawledPage[]> {
  const crawler = new IntelligentCrawler(url, options)
  return await crawler.crawl()
}
