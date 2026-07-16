/**
 * DEBUG CRAWLER - Verifica cosa viene estratto dal crawler
 */

require('dotenv').config()

async function testCrawler() {
  console.log('\n🔍 DEBUG CRAWLER\n')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  
  const testUrl = 'https://example.com'
  
  console.log(`🌐 Testing URL: ${testUrl}\n`)
  
  // Test 1: Firecrawl (if configured)
  const useFirecrawl = process.env.USE_FIRECRAWL === 'true' && process.env.FIRECRAWL_API_KEY
  
  if (useFirecrawl) {
    console.log('━━━ TEST 1: FIRECRAWL ━━━\n')
    
    try {
      const { spawn } = require('child_process')
      const path = require('path')
      
      const firecrawlScript = path.join(__dirname, 'firecrawl-worker.js')
      
      console.log('⏳ Calling Firecrawl...')
      
      const result = await new Promise((resolve, reject) => {
        const process = spawn('node', [firecrawlScript, testUrl, '1'])
        let output = ''
        let errorOutput = ''
        
        process.stdout.on('data', (data) => {
          output += data.toString()
        })
        
        process.stderr.on('data', (data) => {
          errorOutput += data.toString()
        })
        
        process.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`Firecrawl failed: ${errorOutput}`))
          } else {
            try {
              resolve(JSON.parse(output))
            } catch (e) {
              reject(new Error(`Invalid JSON: ${output}`))
            }
          }
        })
        
        setTimeout(() => {
          process.kill()
          reject(new Error('Timeout after 30s'))
        }, 30000)
      })
      
      console.log('\n✅ Firecrawl Result:')
      console.log(`   Pages: ${result.pages?.length || 0}`)
      
      if (result.pages && result.pages[0]) {
        const page = result.pages[0]
        console.log(`   URL: ${page.url}`)
        console.log(`   Title: ${page.title || 'N/A'}`)
        console.log(`   Text Content Type: ${typeof page.textContent}`)
        console.log(`   Text Content Exists: ${!!page.textContent}`)
        console.log(`   Text Content Length: ${page.textContent?.length || 0}`)
        
        if (page.textContent) {
          console.log(`   First 200 chars: "${page.textContent.substring(0, 200)}..."`)
        } else {
          console.log(`   ❌ NO TEXT CONTENT!`)
          console.log(`   Full page object:`, JSON.stringify(page, null, 2))
        }
      }
      
    } catch (error) {
      console.log(`❌ Firecrawl Error: ${error.message}`)
    }
  }
  
  // Test 2: Internal Crawler
  console.log('\n━━━ TEST 2: INTERNAL CRAWLER ━━━\n')
  
  try {
    const { SimpleIntelligentCrawler } = require('../lib/simple-intelligent-crawler')
    
    console.log('⏳ Using SimpleIntelligentCrawler...')
    
    const crawler = new SimpleIntelligentCrawler(testUrl, {
      maxPages: 1,
      maxDepth: 1
    })
    
    const pages = await crawler.crawl()
    
    console.log('\n✅ Internal Crawler Result:')
    console.log(`   Pages: ${pages.length}`)
    
    if (pages[0]) {
      const page = pages[0]
      console.log(`   URL: ${page.url}`)
      console.log(`   Title: ${page.title || 'N/A'}`)
      console.log(`   Text Content Type: ${typeof page.textContent}`)
      console.log(`   Text Content Exists: ${!!page.textContent}`)
      console.log(`   Text Content Length: ${page.textContent?.length || 0}`)
      
      if (page.textContent) {
        console.log(`   First 200 chars: "${page.textContent.substring(0, 200)}..."`)
      } else {
        console.log(`   ❌ NO TEXT CONTENT!`)
        console.log(`   Full page object:`, JSON.stringify(page, null, 2))
      }
    }
    
  } catch (error) {
    console.log(`❌ Internal Crawler Error: ${error.message}`)
    console.error(error)
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

testCrawler().catch(console.error)
