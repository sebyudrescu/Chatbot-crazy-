/**
 * Internal Crawler Provider
 * 
 * Wrapper around SimpleIntelligentCrawler
 * Used as fallback when Firecrawl is not available
 */

import { SimpleIntelligentCrawler } from './simple-intelligent-crawler'
import type { CrawlerProvider, CrawledPage, CrawlOptions } from './crawler-provider'

export class InternalCrawlerProvider implements CrawlerProvider {
  name = 'Internal'
  
  async crawl(startUrl: string, options: CrawlOptions = {}): Promise<CrawledPage[]> {
    console.log(`[Internal] Starting crawl: ${startUrl}`)
    
    const { maxPages = 50, maxDepth = 4 } = options
    
    const crawler = new SimpleIntelligentCrawler(startUrl, {
      maxPages,
      maxDepth
    })
    
    try {
      const pages = await crawler.crawl()
      
      console.log(`[Internal] ✅ Crawled ${pages.length} pages`)
      
      // Convert to standard format
      const standardPages: CrawledPage[] = pages.map(page => ({
        url: page.url,
        title: page.title,
        textContent: page.textContent,
        excerpt: page.textContent?.substring(0, 200) || '',
        quality: page.quality || 50,
      }))
      
      return standardPages
      
    } catch (error: any) {
      console.error(`[Internal] Crawl error:`, error)
      throw new Error(`Internal crawler failed: ${error.message}`)
    }
  }
  
  getSupportedFeatures(): string[] {
    return [
      'Basic Link Discovery',
      'Mozilla Readability',
      'Simple Deduplication',
      'Quality Scoring',
    ]
  }
  
  isAvailable(): boolean {
    return true // Always available as fallback
  }
}
