"use strict";
/**
 * Firecrawl HTTP Provider
 *
 * Uses direct HTTP API calls instead of SDK (more reliable)
 * Based on successful test results
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirecrawlHttpProvider = void 0;
class FirecrawlHttpProvider {
    constructor() {
        this.name = 'Firecrawl (HTTP)';
        this.baseUrl = 'https://api.firecrawl.dev/v1';
        const apiKey = process.env.FIRECRAWL_API_KEY;
        if (!apiKey) {
            throw new Error('FIRECRAWL_API_KEY not configured');
        }
        this.apiKey = apiKey;
        console.log('[Firecrawl HTTP] Provider initialized');
    }
    async crawl(startUrl, options = {}) {
        console.log(`[Firecrawl HTTP] Starting crawl: ${startUrl}`);
        console.log(`[Firecrawl HTTP] Options:`, options);
        const { maxPages = 50, excludePaths = [] } = options;
        try {
            // Step 1: Start crawl job
            console.log('[Firecrawl HTTP] Starting crawl job...');
            const startResponse = await fetch(`${this.baseUrl}/crawl`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    url: startUrl,
                    limit: maxPages,
                    excludePaths: [
                        ...excludePaths,
                        // Default exclusions (glob patterns, not regex)
                        'wp-admin',
                        'admin',
                        'login',
                        'signup',
                        'cart',
                        'checkout',
                    ],
                    scrapeOptions: {
                        formats: ['markdown', 'html'],
                        onlyMainContent: true,
                        waitFor: 1000
                    }
                })
            });
            if (!startResponse.ok) {
                const errorText = await startResponse.text();
                throw new Error(`Failed to start crawl: ${startResponse.status} ${errorText}`);
            }
            const startData = await startResponse.json();
            if (!startData.success || !startData.id) {
                throw new Error(`Crawl job failed to start: ${JSON.stringify(startData)}`);
            }
            const jobId = startData.id;
            console.log(`[Firecrawl HTTP] ✅ Job started: ${jobId}`);
            // Step 2: Poll for completion
            const result = await this.pollJobStatus(jobId);
            if (!result.success) {
                throw new Error('Crawl job failed');
            }
            console.log(`[Firecrawl HTTP] ✅ Crawl completed successfully`);
            console.log(`[Firecrawl HTTP] Found ${result.data?.length || 0} pages`);
            // Step 3: Convert to our format
            const pages = (result.data || []).map((page) => {
                const textContent = page.markdown || this.htmlToText(page.html || '');
                return {
                    url: page.url || startUrl,
                    title: page.metadata?.title || this.extractTitle(page.markdown || page.html) || 'Untitled',
                    textContent,
                    excerpt: page.metadata?.description || textContent.substring(0, 200),
                    quality: this.calculateQuality(textContent),
                    markdown: page.markdown,
                };
            });
            console.log(`[Firecrawl HTTP] Converted ${pages.length} pages to standard format`);
            // Filter out low quality pages (lowered threshold for better coverage)
            const qualityPages = pages.filter(p => p.quality && p.quality > 10);
            console.log(`[Firecrawl HTTP] ${qualityPages.length} pages passed quality filter (threshold: 10)`);
            return qualityPages;
        }
        catch (error) {
            console.error(`[Firecrawl HTTP] Error:`, error);
            throw new Error(`Firecrawl HTTP crawl failed: ${error.message}`);
        }
    }
    /**
     * Poll job status until completion
     */
    async pollJobStatus(jobId, maxAttempts = 60) {
        console.log(`[Firecrawl HTTP] Polling job status: ${jobId}`);
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const response = await fetch(`${this.baseUrl}/crawl/${jobId}`, {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`
                    }
                });
                if (!response.ok) {
                    console.warn(`[Firecrawl HTTP] Status check failed: ${response.status}`);
                    await this.sleep(5000);
                    continue;
                }
                const data = await response.json();
                console.log(`[Firecrawl HTTP] Status [${attempt}/${maxAttempts}]: ${data.status} (${data.completed}/${data.total})`);
                if (data.status === 'completed') {
                    return { success: true, data: data.data };
                }
                if (data.status === 'failed') {
                    return { success: false };
                }
                // Still scraping, wait and retry
                await this.sleep(5000); // Wait 5 seconds between polls
            }
            catch (error) {
                console.warn(`[Firecrawl HTTP] Poll attempt ${attempt} failed:`, error);
                await this.sleep(5000);
            }
        }
        throw new Error('Crawl job timed out');
    }
    /**
     * Sleep helper
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Single page scrape (faster than crawl)
     */
    async scrapeSinglePage(url) {
        console.log(`[Firecrawl HTTP] Scraping single page: ${url}`);
        try {
            const response = await fetch(`${this.baseUrl}/scrape`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    url,
                    formats: ['markdown', 'html'],
                    onlyMainContent: true
                })
            });
            if (!response.ok) {
                console.warn(`[Firecrawl HTTP] Scrape failed: ${response.status}`);
                return null;
            }
            const data = await response.json();
            if (!data.success) {
                return null;
            }
            const textContent = data.markdown || this.htmlToText(data.html || '');
            return {
                url: data.url || url,
                title: data.metadata?.title || this.extractTitle(data.markdown) || 'Untitled',
                textContent,
                excerpt: data.metadata?.description || textContent.substring(0, 200),
                quality: this.calculateQuality(textContent),
                markdown: data.markdown,
            };
        }
        catch (error) {
            console.error(`[Firecrawl HTTP] Scrape error:`, error);
            return null;
        }
    }
    getSupportedFeatures() {
        return [
            'JavaScript Execution',
            'Anti-bot Bypass',
            'Sitemap Discovery',
            'Markdown Output',
            'Structured Data Extraction',
            'Parallel Crawling',
            'Rate Limiting',
            'Auto Retry',
            'Async Job Processing',
            'Direct HTTP API (No SDK)',
        ];
    }
    isAvailable() {
        return !!process.env.FIRECRAWL_API_KEY;
    }
    /**
     * Convert HTML to plain text (fallback)
     */
    htmlToText(html) {
        return html
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    /**
     * Extract title from content
     */
    extractTitle(content) {
        if (!content)
            return null;
        // Look for markdown H1
        const h1Match = content.match(/^#\s+(.+)$/m);
        if (h1Match && h1Match[1])
            return h1Match[1];
        // Look for first line
        const firstLine = content.split('\n')[0];
        if (firstLine && firstLine.length < 100)
            return firstLine;
        return null;
    }
    /**
     * Calculate content quality score
     */
    calculateQuality(text) {
        let score = 0;
        const length = text.length;
        const wordCount = text.split(/\s+/).length;
        // Length scoring
        if (length > 200)
            score += 20;
        if (length > 500)
            score += 15;
        if (length > 1000)
            score += 10;
        if (wordCount > 50)
            score += 10;
        if (wordCount > 100)
            score += 10;
        // Structure indicators
        if (text.includes('\n\n'))
            score += 10; // Has paragraphs
        if (text.match(/\d+\./g)?.length > 2)
            score += 5; // Has lists
        // Penalize very short
        if (length < 100)
            return 0;
        return Math.min(100, score);
    }
}
exports.FirecrawlHttpProvider = FirecrawlHttpProvider;
