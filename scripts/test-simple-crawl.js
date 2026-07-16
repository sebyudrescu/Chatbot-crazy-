/**
 * Test semplice del crawler
 */

const axios = require('axios')
const cheerio = require('cheerio')

async function testSimpleCrawl() {
  console.log('\n🔍 TEST SIMPLE CRAWL\n')
  
  const testUrl = 'https://example.com'
  console.log(`Testing: ${testUrl}\n`)
  
  try {
    console.log('⏳ Fetching...')
    const response = await axios.get(testUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    
    console.log(`✅ Status: ${response.status}`)
    console.log(`📄 Content-Type: ${response.headers['content-type']}`)
    console.log(`📦 Content Length: ${response.data.length} bytes\n`)
    
    // Parse with Cheerio
    const $ = cheerio.load(response.data)
    
    // Remove unwanted elements
    $('script, style, nav, footer, header').remove()
    
    // Extract text
    const text = $('body').text()
      .replace(/\s+/g, ' ')
      .trim()
    
    console.log('📝 Extracted Text:')
    console.log(`   Length: ${text.length} characters`)
    console.log(`   Type: ${typeof text}`)
    console.log(`   First 200 chars: "${text.substring(0, 200)}..."\n`)
    
    // Check if it's valid
    if (!text || text.length === 0) {
      console.log('❌ NO TEXT EXTRACTED!')
    } else {
      console.log('✅ Text extraction successful!')
    }
    
    // Show what would be returned
    const page = {
      url: testUrl,
      title: $('title').text() || 'No title',
      textContent: text,
      wordCount: text.split(' ').length,
      quality: 80,
      depth: 0
    }
    
    console.log('\n📦 Page Object:')
    console.log(JSON.stringify(page, null, 2))
    
  } catch (error) {
    console.log(`\n❌ Error: ${error.message}`)
    console.error(error)
  }
}

testSimpleCrawl()
