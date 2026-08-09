/**
 * Advanced Content Extractor
 * 
 * Intelligent content extraction with noise removal and semantic understanding
 * Optimized for e-commerce, documentation, and corporate websites
 */

import * as cheerio from 'cheerio'
import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'

export interface ExtractedContent {
  title: string
  mainContent: string
  metadata: {
    description?: string
    keywords?: string[]
    productInfo?: ProductInfo[]
    structuredData?: any
  }
  contentType: 'article' | 'product' | 'documentation' | 'general'
  quality: number
  wordCount: number
}

export interface ProductInfo {
  name: string
  price?: string
  description?: string
  category?: string
  features?: string[]
}

/**
 * Noise patterns to remove (global)
 */
const NOISE_PATTERNS = [
  // Navigation
  /menu|navigation|nav-|navbar|sidebar|breadcrumb/gi,
  // Footers
  /footer|copyright|©|all rights reserved/gi,
  // Cookie/Privacy
  /cookie|privacy policy|gdpr|accept|reject|consent/gi,
  // Login/Auth
  /sign in|sign up|login|logout|register|forgot password/gi,
  // Newsletter/Subscribe
  /newsletter|subscribe|unsubscribe|email signup/gi,
  // Social/Share
  /share on|follow us|social media|facebook|twitter|instagram/gi,
  // Shopping cart
  /add to cart|view cart|checkout|shopping bag/gi,
  // Ads
  /advertisement|sponsored|ad-|banner/gi,
]

/**
 * Selectors to remove (before extraction)
 */
const REMOVE_SELECTORS = [
  'script', 'style', 'noscript', 'iframe', 'embed',
  'nav', 'header', 'footer', 'aside',
  '.advertisement', '.ad', '.banner', '.popup', '.modal',
  '.cookie-banner', '.cookie-notice', '.gdpr',
  '.social-share', '.share-buttons',
  '.newsletter-signup', '.email-signup',
  '.breadcrumb', '.pagination',
  '.related-posts', '.sidebar', '.widget',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
  '#comments', '.comments', '.comment-section'
]

/**
 * High-value selectors (try these first)
 */
const CONTENT_SELECTORS = [
  // Main content
  'main', 'article', '[role="main"]',
  // Product pages
  '.product-description', '.product-details', '.product-info',
  '#product-description', '#product-details',
  '[itemtype*="Product"]',
  // Documentation
  '.documentation', '.doc-content', '.markdown-body',
  '#documentation', '#content',
  // Blog/Articles
  '.post-content', '.article-content', '.entry-content',
  '.blog-post', '.single-post',
  // Generic
  '.content', '#content', '.main-content', '#main-content'
]

/**
 * Clean noise from text
 */
function cleanNoiseFromText(text: string): string {
  let cleaned = text

  // Remove noise patterns
  for (const pattern of NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ')
  }

  // Remove email addresses (to avoid spam)
  cleaned = cleaned.replace(/[\w.-]+@[\w.-]+\.\w+/g, '')

  // Remove URLs
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, '')

  // Remove excessive whitespace
  cleaned = cleaned.replace(/\s+/g, ' ')
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')

  // Remove lines with just numbers/symbols
  cleaned = cleaned
    .split('\n')
    .filter(line => {
      const trimmed = line.trim()
      // Keep lines with at least some words
      const wordCount = trimmed.split(/\s+/).filter(w => /[a-zA-Z]{2,}/.test(w)).length
      return wordCount >= 3
    })
    .join('\n')

  return cleaned.trim()
}

/**
 * Calculate content quality score
 */
function calculateQuality(text: string, metadata: any): number {
  let score = 0
  const length = text.length
  const wordCount = text.split(/\s+/).length

  // Length-based scoring
  if (length > 500) score += 20
  if (length > 1500) score += 15
  if (length > 3000) score += 10
  if (wordCount > 100) score += 10

  // Structure indicators
  if (text.includes('\n\n')) score += 10 // Has paragraphs
  if ((text.match(/\d+\./g)?.length || 0) > 2) score += 5 // Has lists
  if ((text.match(/[A-Z][^.!?]*[.!?]/g)?.length || 0) > 5) score += 10 // Has sentences

  // Has metadata
  if (metadata.description) score += 10
  if (metadata.keywords && metadata.keywords.length > 0) score += 5
  if (metadata.productInfo && metadata.productInfo.length > 0) score += 15

  // Penalty for noise indicators
  const noiseWords = ['cookie', 'accept', 'reject', 'login', 'subscribe', 'cart']
  noiseWords.forEach(word => {
    const count = (text.toLowerCase().match(new RegExp(word, 'g')) || []).length
    if (count > 2) score -= 5
  })

  // Very short content is low quality
  if (length < 200) return 0
  if (wordCount < 50) return 0

  return Math.max(0, Math.min(100, score))
}

/**
 * Detect content type
 */
function detectContentType(html: string, $: cheerio.CheerioAPI): ExtractedContent['contentType'] {
  // Product page indicators
  if (
    $('.product-price, .price, [itemprop="price"]').length > 0 ||
    $('[itemtype*="Product"]').length > 0 ||
    html.includes('"@type":"Product"')
  ) {
    return 'product'
  }

  // Documentation indicators
  if (
    $('.documentation, .docs, .api-reference').length > 0 ||
    $('code, pre').length > 10
  ) {
    return 'documentation'
  }

  // Article indicators
  if (
    $('article, .post, .blog-post').length > 0 ||
    $('[itemtype*="Article"]').length > 0
  ) {
    return 'article'
  }

  return 'general'
}

/**
 * Extract product information
 */
function extractProductInfo($: cheerio.CheerioAPI): ProductInfo[] {
  const products: ProductInfo[] = []

  // Try structured data first (JSON-LD)
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || '{}')
      if (data['@type'] === 'Product') {
        products.push({
          name: data.name || '',
          price: data.offers?.price || data.offers?.[0]?.price,
          description: data.description || '',
          category: data.category || '',
        })
      }
    } catch (e) {
      // Invalid JSON, skip
    }
  })

  // Fallback to HTML selectors
  if (products.length === 0) {
    const name = $('.product-name, .product-title, [itemprop="name"]').first().text().trim()
    const price = $('.product-price, .price, [itemprop="price"]').first().text().trim()
    const description = $('.product-description, .product-details, [itemprop="description"]').first().text().trim()

    if (name) {
      products.push({
        name,
        price: price || undefined,
        description: description || undefined,
      })
    }
  }

  return products
}

/**
 * Extract with Cheerio (for product/general pages)
 */
function extractWithCheerio(html: string, $: cheerio.CheerioAPI): { title: string; content: string } | null {
  // Remove noise elements
  REMOVE_SELECTORS.forEach(selector => {
    $(selector).remove()
  })

  let content = ''
  let foundContent = false

  // Try high-value selectors first
  for (const selector of CONTENT_SELECTORS) {
    const element = $(selector).first()
    if (element.length > 0) {
      content = element.text()
      if (content.length > 200) {
        foundContent = true
        break
      }
    }
  }

  // Fallback to body
  if (!foundContent) {
    content = $('body').text()
  }

  // FIX ENCODING BEFORE cleaning whitespace
  content = content
    .replace(/â‚¬/g, '€')   // Fix Euro (UTF-8 issue)
    .replace(/Â€/g, '€')    // Another Euro variant
    .replace(/�'�/g, '€')   // Corrupted Euro
    .replace(/�/g, '')      // Remove generic corruption
    .replace(/â€™/g, "'")   // Fix apostrophe
    .replace(/â€�/g, '"')   // Fix quotes
    .replace(/â€�/g, '"')   // Fix closing quotes
    .replace(/Ã¨/g, 'è')    // Fix e accent
    .replace(/Ã©/g, 'é')    // Fix e accent
    .replace(/Ã /g, 'à')    // Fix a accent
    .replace(/Ã¹/g, 'ù')    // Fix u accent
    .replace(/Ã²/g, 'ò')    // Fix o accent
    .replace(/Ã¬/g, 'ì')    // Fix i accent

  // Clean whitespace
  content = content
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim()
    .normalize('NFC')       // Unicode normalization

  const title = $('title').text().trim() || 
                $('h1').first().text().trim() || 
                'Untitled'

  if (content.length < 200) return null

  return { title, content }
}

function extractWithReadability(html: string, url: string): { title: string; content: string } | null {
  try {
    const dom = new JSDOM(html, { url })
    const article = new Readability(dom.window.document).parse()
    const result = article?.textContent?.trim()
      ? { title: article.title || 'Untitled', content: article.textContent }
      : null
    dom.window.close()
    return result
  } catch {
    return null
  }
}

/**
 * MAIN EXTRACTION FUNCTION
 */
export async function extractAdvancedContent(
  html: string,
  url: string
): Promise<ExtractedContent | null> {
  try {
    const $ = cheerio.load(html)

    // Detect content type
    const contentType = detectContentType(html, $)
    console.log(`[Extractor] Detected content type: ${contentType}`)

    // Extract metadata
    const metaDescription = $('meta[name="description"]').attr('content') || 
                            $('meta[property="og:description"]').attr('content')
    
    const metaKeywords = $('meta[name="keywords"]').attr('content')
      ?.split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0)

    // Extract product info if applicable
    const productInfo = contentType === 'product' ? extractProductInfo($) : []

    // Choose extraction strategy based on content type
    let extracted: { title: string; content: string } | null = null

    // Cheerio is deterministic in Node/serverless runtimes and covers the
    // article/main selectors above without requiring a browser DOM polyfill.
    extracted = extractWithCheerio(html, $)
    const readability = contentType === 'product' ? null : extractWithReadability(html, url)
    if (readability) {
      const cheerioScore = extracted ? calculateQuality(cleanNoiseFromText(extracted.content), {}) : 0
      const readabilityScore = calculateQuality(cleanNoiseFromText(readability.content), {})
      if (!extracted || readabilityScore > cheerioScore) extracted = readability
    }

    if (!extracted) {
      console.log('[Extractor] No content extracted')
      return null
    }

    // Clean noise from content
    const cleanedContent = cleanNoiseFromText(extracted.content)

    // Calculate quality
    const wordCount = cleanedContent.split(/\s+/).length
    const quality = calculateQuality(cleanedContent, {
      description: metaDescription,
      keywords: metaKeywords,
      productInfo
    })

    console.log(`[Extractor] Quality: ${quality}, Words: ${wordCount}`)

    // Reject low quality content
    if (quality < 25 || wordCount < 50) {
      console.log('[Extractor] Content quality too low')
      return null
    }

    return {
      title: extracted.title,
      mainContent: cleanedContent,
      metadata: {
        description: metaDescription,
        keywords: metaKeywords,
        productInfo: productInfo.length > 0 ? productInfo : undefined,
      },
      contentType,
      quality,
      wordCount
    }

  } catch (error) {
    console.error('[Extractor] Error:', error)
    return null
  }
}

/**
 * Extract multiple sections for long pages
 */
export function extractSections(content: string): string[] {
  // Split by headings
  const sections = content.split(/(?=^[A-Z][^\n]{10,80}$)/m)
  
  return sections
    .map(s => s.trim())
    .filter(s => s.length > 100)
}
