/**
 * Smart Text Chunking Utilities
 * Splits text into chunks while preserving semantic meaning
 */

export interface ChunkMetadata {
  sourceId: string
  sourceType: string
  chunkIndex: number
  startChar: number
  endChar: number
  pageNumber?: number
  title?: string
}

export interface TextChunk {
  text: string
  metadata: ChunkMetadata
}

/**
 * Split text by sentences to avoid breaking mid-sentence
 */
function splitIntoSentences(text: string): string[] {
  // Simple sentence splitter (can be enhanced with NLP library)
  return text
    .replace(/([.!?])\s+/g, '$1|')
    .split('|')
    .filter((s) => s.trim().length > 0)
}

/**
 * Chunk text with overlap, preserving sentence boundaries
 */
export function chunkTextSmart(
  text: string,
  sourceId: string,
  sourceType: string,
  options: {
    chunkSize?: number
    overlap?: number
  } = {}
): TextChunk[] {
  const { chunkSize = 1000, overlap = 100 } = options // DECREASED from 200 to 100 for balance
  
  const sentences = splitIntoSentences(text)
  const chunks: TextChunk[] = []
  
  let currentChunk = ''
  let currentStartChar = 0
  let chunkIndex = 0
  
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim()
    
    // If adding this sentence exceeds chunk size, save current chunk
    if (currentChunk.length > 0 && currentChunk.length + sentence.length > chunkSize) {
      chunks.push({
        text: currentChunk.trim(),
        metadata: {
          sourceId,
          sourceType,
          chunkIndex,
          startChar: currentStartChar,
          endChar: currentStartChar + currentChunk.length,
        },
      })
      
      // Start new chunk with overlap
      const overlapText = currentChunk.slice(-overlap)
      currentChunk = overlapText + ' ' + sentence
      currentStartChar += currentChunk.length - overlapText.length
      chunkIndex++
    } else {
      currentChunk += (currentChunk.length > 0 ? ' ' : '') + sentence
    }
  }
  
  // Add last chunk
  if (currentChunk.length > 0) {
    chunks.push({
      text: currentChunk.trim(),
      metadata: {
        sourceId,
        sourceType,
        chunkIndex,
        startChar: currentStartChar,
        endChar: currentStartChar + currentChunk.length,
      },
    })
  }
  
  return chunks
}

/**
 * Chunk text by paragraphs (for documents with clear structure)
 */
export function chunkByParagraphs(
  text: string,
  sourceId: string,
  sourceType: string,
  maxChunkSize: number = 1500
): TextChunk[] {
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  
  const chunks: TextChunk[] = []
  let currentChunk = ''
  let currentStartChar = 0
  let chunkIndex = 0
  
  for (const paragraph of paragraphs) {
    if (currentChunk.length > 0 && currentChunk.length + paragraph.length > maxChunkSize) {
      // Save current chunk
      chunks.push({
        text: currentChunk.trim(),
        metadata: {
          sourceId,
          sourceType,
          chunkIndex,
          startChar: currentStartChar,
          endChar: currentStartChar + currentChunk.length,
        },
      })
      
      // Start new chunk
      currentChunk = paragraph
      currentStartChar += currentChunk.length
      chunkIndex++
    } else {
      currentChunk += (currentChunk.length > 0 ? '\n\n' : '') + paragraph
    }
  }
  
  // Add last chunk
  if (currentChunk.length > 0) {
    chunks.push({
      text: currentChunk.trim(),
      metadata: {
        sourceId,
        sourceType,
        chunkIndex,
        startChar: currentStartChar,
        endChar: currentStartChar + currentChunk.length,
      },
    })
  }
  
  return chunks
}

/**
 * Simple chunking with fixed size (fallback)
 */
export function chunkTextSimple(
  text: string,
  sourceId: string,
  sourceType: string,
  chunkSize: number = 1000,
  overlap: number = 200
): TextChunk[] {
  const chunks: TextChunk[] = []
  let start = 0
  let chunkIndex = 0
  
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    const chunkText = text.slice(start, end)
    
    chunks.push({
      text: chunkText,
      metadata: {
        sourceId,
        sourceType,
        chunkIndex,
        startChar: start,
        endChar: end,
      },
    })
    
    start = end - overlap
    chunkIndex++
    
    // Prevent infinite loop
    if (start >= end) break
  }
  
  return chunks
}

/**
 * Auto-select best chunking strategy based on text characteristics
 */
export function chunkTextAuto(
  text: string,
  sourceId: string,
  sourceType: string
): TextChunk[] {
  // Check if text has clear paragraph structure
  const paragraphCount = (text.match(/\n\n+/g) || []).length
  const hasParagraphs = paragraphCount > 5 && text.length / paragraphCount < 2000
  
  if (hasParagraphs) {
    console.log(`Using paragraph-based chunking for ${sourceId}`)
    return chunkByParagraphs(text, sourceId, sourceType)
  } else {
    console.log(`Using sentence-aware chunking for ${sourceId}`)
    return chunkTextSmart(text, sourceId, sourceType)
  }
}
