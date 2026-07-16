/**
 * Firecrawl Worker Script
 * 
 * Standalone Node.js script that uses Firecrawl SDK
 * Called by API via child_process
 * 
 * Usage: node scripts/firecrawl-worker.js <url> <maxPages> <apiKey>
 */

const FirecrawlApp = require('@mendable/firecrawl-js').default

async function crawl() {
  const args = process.argv.slice(2)
  
  if (args.length < 3) {
    console.error(JSON.stringify({
      success: false,
      error: 'Missing arguments. Usage: node firecrawl-worker.js <url> <maxPages> <apiKey>'
    }))
    process.exit(1)
  }
  
  const [url, maxPages, apiKey] = args
  
  try {
    console.error(`[Firecrawl] Starting crawl: ${url}`)
    console.error(`[Firecrawl] Max pages: ${maxPages}`)
    
    const app = new FirecrawlApp({ apiKey })
    
    // Configurazione Firecrawl con pattern sicuri
    const crawlOptions = {
      limit: parseInt(maxPages),
      scrapeOptions: {
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        waitFor: 1000,
      }
    }
    
    // Aggiungi excludePaths solo se non causano problemi regex
    try {
      crawlOptions.excludePaths = [
        'wp-admin',
        'wp-includes',
        'admin',
        'login',
        'cart',
        'checkout',
        'account',
        'my-account'
      ]
    } catch (e) {
      console.error(`[Firecrawl] Warning: excludePaths not supported, continuing without them`)
    }
    
    const result = await app.v1.crawlUrl(url, crawlOptions)
    
    console.error(`[Firecrawl] Crawl completed: ${result.success}`)
    console.error(`[Firecrawl] Pages found: ${result.data?.length || 0}`)
    
    // Output JSON to stdout (API will parse this)
    console.log(JSON.stringify({
      success: result.success,
      data: result.data || [],
      error: result.error || null
    }))
    
    process.exit(0)
    
  } catch (error) {
    console.error(`[Firecrawl] Error:`, error.message)
    console.log(JSON.stringify({
      success: false,
      error: error.message,
      data: []
    }))
    process.exit(1)
  }
}

crawl()
