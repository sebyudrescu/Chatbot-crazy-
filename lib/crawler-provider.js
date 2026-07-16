"use strict";
/**
 * Crawler Provider Abstraction
 *
 * Allows switching between different crawling strategies:
 * - Internal crawler (SimpleIntelligentCrawler)
 * - Firecrawl (external service)
 * - Future: Apify, Crawlee, etc.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCrawlerProvider = getCrawlerProvider;
/**
 * Get the configured crawler provider
 */
function getCrawlerProvider() {
    const useFirecrawl = process.env.USE_FIRECRAWL === 'true';
    if (useFirecrawl && process.env.FIRECRAWL_API_KEY) {
        // Use HTTP provider (more reliable than SDK)
        const { FirecrawlHttpProvider } = require('./firecrawl-http-provider');
        try {
            return new FirecrawlHttpProvider();
        }
        catch (error) {
            console.warn('[CrawlerProvider] Firecrawl HTTP init failed, falling back to internal:', error);
        }
    }
    // Fallback to internal crawler
    const { InternalCrawlerProvider } = require('./internal-crawler-provider');
    return new InternalCrawlerProvider();
}
