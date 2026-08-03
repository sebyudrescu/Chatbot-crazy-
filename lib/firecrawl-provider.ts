/**
 * Firecrawl Provider
 * 
 * Uses Firecrawl API for robust, production-grade web crawling
 * Handles JavaScript, anti-bot protection, sitemaps, etc.
 */

import type { CrawlerProvider, CrawledPage, CrawlOptions } from './crawler-provider'
import { extractProductsFromHtml } from './product-extractor'
import { deduplicateCrawledPages, resolveFirecrawlPageUrl } from './crawler-pages'

export class FirecrawlProvider implements CrawlerProvider {
  name = 'Firecrawl'
  private client: any
  
  constructor() {
    const apiKey = process.env.FIRECRAWL_API_KEY
    
    if (!apiKey) {
      throw new Error('FIRECRAWL_API_KEY not configured')
    }
    
    // Dynamic import for CommonJS compatibility
    const { default: FirecrawlApp } = require('@mendable/firecrawl-js')
    this.client = new FirecrawlApp({ apiKey })
    console.log('[Firecrawl] Provider initialized')
  }
  
  async crawl(startUrl: string, options: CrawlOptions = {}): Promise<CrawledPage[]> {
    console.log(`[Firecrawl] Starting crawl: ${startUrl}`)
    console.log(`[Firecrawl] Options:`, options)
    
    const { maxPages = 50, excludePaths = [] } = options
    
    try {
      // Firecrawl crawl options
      const crawlParams = {
        excludePaths: [
          ...excludePaths,
          // Default exclusions
          '**/wp-admin/**',
          '**/admin/**',
          '**/login/**',
          '**/signup/**',
          '**/cart/**',
          '**/checkout/**',
          '**/*.pdf',
          '**/*.jpg',
          '**/*.png',
          '**/*.gif',
        ],
        limit: maxPages,
        scrapeOptions: {
          formats: ['markdown', 'html'],
          onlyMainContent: false,
          waitFor: 1000, // Wait for JS to load
        }
      }
      
      console.log(`[Firecrawl] Crawl params:`, crawlParams)
      
      // Start crawl using v1 API (correct method signature)
      const crawlResponse = await this.client.crawlUrl(startUrl, crawlParams)
      
      if (!crawlResponse.success) {
        throw new Error(`Firecrawl crawl failed: ${crawlResponse.error}`)
      }
      
      console.log(`[Firecrawl] ✅ Crawl completed successfully`)
      console.log(`[Firecrawl] Found ${crawlResponse.data?.length || 0} pages`)
      
      // Convert to our format
      const pages: CrawledPage[] = (crawlResponse.data || []).map((page: any) => {
        // Firecrawl returns markdown (clean) and/or html
        const textContent = page.markdown || this.htmlToText(page.html || '')
        
        const pageUrl = resolveFirecrawlPageUrl(page, startUrl)
        return {
          url: pageUrl,
          title: page.metadata?.title || this.extractTitle(page.markdown || page.html) || 'Untitled',
          textContent,
          excerpt: page.metadata?.description || textContent.substring(0, 200),
          quality: this.calculateQuality(textContent),
          markdown: page.markdown,
          products: page.html ? extractProductsFromHtml(page.html, pageUrl) : [],
        }
      })
      
      console.log(`[Firecrawl] Converted ${pages.length} pages to standard format`)
      
      // Filter out low quality pages
      const qualityPages = pages.filter(p => p.quality && p.quality > 30)
      console.log(`[Firecrawl] ${qualityPages.length} pages passed quality filter`)
      
      return deduplicateCrawledPages(qualityPages, startUrl)
      
    } catch (error: any) {
      console.error(`[Firecrawl] Error:`, error)
      throw new Error(`Firecrawl crawl failed: ${error.message}`)
    }
  }
  
  getSupportedFeatures(): string[] {
    return [
      'JavaScript Execution',
      'Anti-bot Bypass',
      'Sitemap Discovery',
      'Markdown Output',
      'Structured Data Extraction',
      'Parallel Crawling',
      'Rate Limiting',
      'Auto Retry',
    ]
  }
  
  isAvailable(): boolean {
    return !!process.env.FIRECRAWL_API_KEY
  }
  
  /**
   * Convert HTML to plain text (fallback)
   */
  private htmlToText(html: string): string {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  
  /**
   * Extract title from content
   */
  private extractTitle(content: string): string | null {
    // Look for markdown H1
    const h1Match = content.match(/^#\s+(.+)$/m)
    if (h1Match?.[1]) return h1Match[1]
    
    // Look for first line
    const firstLine = content.split('\n')[0]
    if (firstLine && firstLine.length < 100) return firstLine
    
    return null
  }
  
  /**
   * Calculate content quality score
   */
  private calculateQuality(text: string): number {
    let score = 0
    
    const length = text.length
    const wordCount = text.split(/\s+/).length
    
    // Length scoring
    if (length > 200) score += 20
    if (length > 500) score += 15
    if (length > 1000) score += 10
    if (wordCount > 50) score += 10
    if (wordCount > 100) score += 10
    
    // Structure indicators
    if (text.includes('\n\n')) score += 10 // Has paragraphs
    if ((text.match(/\d+\./g)?.length || 0) > 2) score += 5 // Has lists
    
    // Penalize very short
    if (length < 100) return 0
    
    return Math.min(100, score)
  }
}
