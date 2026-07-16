/**
 * Crawler Provider Abstraction
 * 
 * Allows switching between different crawling strategies:
 * - Internal crawler (SimpleIntelligentCrawler)
 * - Firecrawl (external service)
 * - Future: Apify, Crawlee, etc.
 */

export interface CrawledPage {
  url: string
  title: string
  textContent: string
  excerpt?: string
  quality?: number
  markdown?: string
}

export interface CrawlOptions {
  maxPages?: number
  maxDepth?: number
  includePaths?: string[]
  excludePaths?: string[]
  timeout?: number
}

export interface CrawlerProvider {
  name: string
  
  /**
   * Crawl a website starting from the given URL
   */
  crawl(startUrl: string, options?: CrawlOptions): Promise<CrawledPage[]>
  
  /**
   * Get supported features
   */
  getSupportedFeatures(): string[]
  
  /**
   * Check if provider is available/configured
   */
  isAvailable(): boolean
}

/**
 * Get the configured crawler provider
 */
export function getCrawlerProvider(): CrawlerProvider {
  const useFirecrawl = process.env.USE_FIRECRAWL === 'true'
  
  if (useFirecrawl && process.env.FIRECRAWL_API_KEY) {
    // Use HTTP provider (more reliable than SDK)
    const { FirecrawlHttpProvider } = require('./firecrawl-http-provider')
    try {
      return new FirecrawlHttpProvider()
    } catch (error) {
      console.warn('[CrawlerProvider] Firecrawl HTTP init failed, falling back to internal:', error)
    }
  }
  
  // Fallback to internal crawler
  const { InternalCrawlerProvider } = require('./internal-crawler-provider')
  return new InternalCrawlerProvider()
}
