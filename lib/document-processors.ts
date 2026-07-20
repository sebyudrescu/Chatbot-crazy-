/**
 * Document Processing Utilities
 * Extract text from PDFs and URLs
 */

import { PDFParse } from 'pdf-parse'
import * as cheerio from 'cheerio'
import mammoth from 'mammoth'
import { assertSafeRemoteUrl } from './url-safety'

/**
 * Extract text from PDF buffer
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  try {
    const result = await parser.getText()
    return result.text
  } catch (error) {
    console.error('Error extracting text from PDF:', error)
    throw new Error('Failed to extract text from PDF')
  } finally {
    await parser.destroy().catch(() => undefined)
  }
}

export async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  } catch {
    throw new Error('Impossibile leggere il documento DOCX')
  }
}

export function extractTextFromPlainFile(buffer: Buffer, type: 'txt' | 'csv'): string {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  if (type === 'csv') {
    return text.split(/\r?\n/).map((row, index) => `${index === 0 ? 'Intestazioni' : `Riga ${index}`}: ${row}`).join('\n')
  }
  return text
}

export function normalizeDocumentText(text: string): string {
  return text.replace(/\0/g, '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Scrape text content from a URL
 */
export async function extractTextFromURL(url: string): Promise<string> {
  try {
    await assertSafeRemoteUrl(url)
    // Create abort controller for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ChatbotRAG/1.0)',
      },
      signal: controller.signal,
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const html = await response.text()
    const $ = cheerio.load(html)
    
    // Remove script, style, and other non-content elements
    $('script, style, nav, footer, header, aside, iframe').remove()
    
    // Extract text from main content areas
    const mainSelectors = [
      'main',
      'article',
      '[role="main"]',
      '.content',
      '#content',
      '.post-content',
      '.article-content',
    ]
    
    let text = ''
    
    // Try main selectors first
    for (const selector of mainSelectors) {
      const element = $(selector)
      if (element.length > 0) {
        text = element.text()
        break
      }
    }
    
    // Fallback to body if no main content found
    if (!text) {
      text = $('body').text()
    }
    
    // Clean up whitespace
    text = text
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim()
    
    if (!text || text.length < 100) {
      throw new Error('Insufficient content extracted from URL')
    }
    
    return text
  } catch (error) {
    console.error('Error extracting text from URL:', error)
    throw new Error('Failed to extract text from URL')
  }
}

/**
 * Clean and normalize text
 */
export function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ') // Multiple spaces to single space
    .replace(/\n{3,}/g, '\n\n') // Multiple newlines to max 2
    .trim()
}

/**
 * Validate if URL is accessible and contains content
 */
export async function validateURL(url: string): Promise<boolean> {
  try {
    await assertSafeRemoteUrl(url)
    // Create abort controller for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      return false
    }
    
    const contentType = response.headers.get('content-type') || ''
    return contentType.includes('text/html')
  } catch {
    return false
  }
}
