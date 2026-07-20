/**
 * Smart Chunking System
 * 
 * Semantic-aware chunking that preserves meaning and context
 * Optimized for product descriptions, documentation, and articles
 */

import { TextChunk, ChunkMetadata } from './chunking'

export interface SmartChunkOptions {
  minChunkSize?: number      // Minimum chars per chunk (default: 800)
  maxChunkSize?: number      // Maximum chars per chunk (default: 2000)
  overlap?: number           // Overlap between chunks (default: 300)
  preserveStructure?: boolean // Keep headings with their content (default: true)
}

/**
 * Detect semantic boundaries (headings, lists, paragraphs)
 */
interface SemanticBoundary {
  type: 'heading' | 'paragraph' | 'list' | 'product' | 'section'
  start: number
  end: number
  text: string
  importance: number // 1-10, higher = more important to keep together
}

function detectSemanticBoundaries(text: string): SemanticBoundary[] {
  const boundaries: SemanticBoundary[] = []
  const lines = text.split('\n')
  
  let currentPos = 0
  let currentParagraph = ''
  let paragraphStart = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const lineLength = line.length + 1 // +1 for newline
    
    if (line.length === 0) {
      // Empty line - boundary
      if (currentParagraph.length > 0) {
        boundaries.push({
          type: 'paragraph',
          start: paragraphStart,
          end: currentPos,
          text: currentParagraph.trim(),
          importance: 5
        })
        currentParagraph = ''
      }
      currentPos += lineLength
      continue
    }

    // Detect heading (line that's short, capitalized, no period at end)
    const isHeading = 
      line.length < 80 &&
      line.length > 10 &&
      /^[A-Z]/.test(line) &&
      !/[.!?]$/.test(line) &&
      !line.includes('  ') // Not just spaces

    if (isHeading) {
      // Save previous paragraph
      if (currentParagraph.length > 0) {
        boundaries.push({
          type: 'paragraph',
          start: paragraphStart,
          end: currentPos,
          text: currentParagraph.trim(),
          importance: 5
        })
      }

      // Add heading
      boundaries.push({
        type: 'heading',
        start: currentPos,
        end: currentPos + lineLength,
        text: line,
        importance: 9 // High importance - keep with next content
      })

      currentParagraph = ''
      paragraphStart = currentPos + lineLength
    } else {
      // Regular content line
      if (currentParagraph.length === 0) {
        paragraphStart = currentPos
      }
      currentParagraph += (currentParagraph.length > 0 ? '\n' : '') + line
    }

    currentPos += lineLength
  }

  // Add last paragraph
  if (currentParagraph.length > 0) {
    boundaries.push({
      type: 'paragraph',
      start: paragraphStart,
      end: currentPos,
      text: currentParagraph.trim(),
      importance: 5
    })
  }

  return boundaries
}

/**
 * Detect product blocks (name + price + description)
 */
function detectProductBlocks(boundaries: SemanticBoundary[]): SemanticBoundary[] {
  const enhanced: SemanticBoundary[] = []

  for (let i = 0; i < boundaries.length; i++) {
    const current = boundaries[i]
    const next = boundaries[i + 1]

    // Check if current looks like product name (short, capitalized)
    const looksLikeProductName = 
      current.text.length < 100 &&
      /^[A-Z]/.test(current.text) &&
      current.text.split(' ').length < 15

    // Check if next contains price indicators
    const nextHasPrice = next && (
      /\$\d+|\d+\s*€|\d+\.\d+|price|prezzo/i.test(next.text)
    )

    if (looksLikeProductName && nextHasPrice) {
      // Merge as product block
      enhanced.push({
        type: 'product',
        start: current.start,
        end: next.end,
        text: current.text + '\n' + next.text,
        importance: 10 // Highest importance - never split
      })
      i++ // Skip next since we merged it
    } else {
      enhanced.push(current)
    }
  }

  return enhanced
}

/**
 * Smart chunking that respects semantic boundaries
 */
export function chunkTextSmart(
  text: string,
  sourceId: string,
  sourceType: string,
  options: SmartChunkOptions = {}
): TextChunk[] {
  const {
    minChunkSize = 800,
    maxChunkSize = 2000,
    overlap = 300,
    preserveStructure = true
  } = options

  console.log(`[SmartChunk] Chunking with size ${minChunkSize}-${maxChunkSize}, overlap ${overlap}`)

  // Detect semantic boundaries
  let boundaries = detectSemanticBoundaries(text)
  
  // Enhance with product detection
  if (sourceType === 'url') {
    boundaries = detectProductBlocks(boundaries)
  }

  console.log(`[SmartChunk] Found ${boundaries.length} semantic boundaries`)

  const chunks: TextChunk[] = []
  let currentChunk = ''
  let currentStart = 0
  let chunkIndex = 0
  let lastHeading = ''

  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i]
    const boundaryText = boundary.text

    // Special handling for headings
    if (boundary.type === 'heading' && preserveStructure) {
      lastHeading = boundaryText
      
      // If we have a current chunk that's big enough, save it
      if (currentChunk.length >= minChunkSize) {
        chunks.push({
          text: currentChunk.trim(),
          metadata: {
            sourceId,
            sourceType,
            chunkIndex,
            startChar: currentStart,
            endChar: boundary.start
          }
        })
        chunkIndex++
        currentChunk = ''
        currentStart = boundary.start
      }
      
      // Start new chunk with heading
      currentChunk = boundaryText + '\n\n'
      continue
    }

    // Check if adding this boundary would exceed max size
    if (currentChunk.length > 0 && currentChunk.length + boundaryText.length > maxChunkSize) {
      // Current chunk is full - save it
      chunks.push({
        text: currentChunk.trim(),
        metadata: {
          sourceId,
          sourceType,
          chunkIndex,
          startChar: currentStart,
          endChar: boundary.start
        }
      })
      chunkIndex++

      // Start new chunk with overlap
      const overlapText = currentChunk.slice(-overlap)
      currentChunk = overlapText + '\n\n'
      
      // Include last heading in new chunk for context
      if (lastHeading && preserveStructure) {
        currentChunk = lastHeading + '\n\n' + currentChunk
      }
      
      currentStart = boundary.start - overlap
    }

    // Add boundary to current chunk
    currentChunk += (currentChunk.length > 0 ? '\n\n' : '') + boundaryText
  }

  // Save last chunk
  if (currentChunk.trim().length >= minChunkSize * 0.5) { // Allow smaller last chunk
    chunks.push({
      text: currentChunk.trim(),
      metadata: {
        sourceId,
        sourceType,
        chunkIndex,
        startChar: currentStart,
        endChar: text.length
      }
    })
  } else if (chunks.length > 0) {
    // Merge small last chunk with previous
    const lastChunk = chunks[chunks.length - 1]
    lastChunk.text += '\n\n' + currentChunk.trim()
    lastChunk.metadata.endChar = text.length
  } else if (currentChunk.trim().length > 0) {
    // Short but valid documents still need one searchable chunk. The
    // content-validation stage applies the definitive length/word checks.
    chunks.push({
      text: currentChunk.trim(),
      metadata: {
        sourceId,
        sourceType,
        chunkIndex,
        startChar: currentStart,
        endChar: text.length,
      },
    })
  }

  console.log(`[SmartChunk] Created ${chunks.length} chunks (avg: ${Math.round(text.length / chunks.length)} chars)`)

  return chunks
}

/**
 * Auto-detect best chunking strategy
 */
export function chunkTextAuto(
  text: string,
  sourceId: string,
  sourceType: string
): TextChunk[] {
  const textLength = text.length
  const hasStructure = (text.match(/\n\n+/g) || []).length > 5

  // For short texts, use smaller chunks
  if (textLength < 2000) {
    return chunkTextSmart(text, sourceId, sourceType, {
      minChunkSize: 400,
      maxChunkSize: 1000,
      overlap: 150
    })
  }

  // For very long texts, use larger chunks
  if (textLength > 10000) {
    return chunkTextSmart(text, sourceId, sourceType, {
      minChunkSize: 1200,
      maxChunkSize: 2500,
      overlap: 400
    })
  }

  // Standard chunking
  return chunkTextSmart(text, sourceId, sourceType, {
    minChunkSize: 800,
    maxChunkSize: 2000,
    overlap: 300
  })
}

/**
 * Extract title/summary for each chunk (for better retrieval)
 */
export function enrichChunkWithContext(chunk: TextChunk, fullText: string): TextChunk {
  const lines = chunk.text.split('\n')
  
  // Find first meaningful line as title
  const title = lines.find(line => {
    const trimmed = line.trim()
    return trimmed.length > 10 && 
           trimmed.length < 100 &&
           /^[A-Z]/.test(trimmed)
  })

  if (title) {
    // Add title as metadata
    chunk.metadata = {
      ...chunk.metadata,
      title: title.trim()
    }
  }

  return chunk
}
