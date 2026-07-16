/**
 * CONTENT VALIDATION - Sistema di Validazione Robusto
 * 
 * Garantisce che solo contenuto valido arrivi alla pipeline di embedding.
 * Include logging dettagliato, validazione multi-livello e fail-safe.
 */

import 'server-only'

export interface ValidationResult {
  valid: boolean
  reason?: string
  sanitized?: string
  metadata: {
    originalType: string
    originalLength: number
    hasContent: boolean
    isEmpty: boolean
    isString: boolean
    sanitizedLength?: number
  }
}

/**
 * Valida e sanitizza il contenuto testuale PRIMA dell'embedding
 */
export function validateAndSanitizeContent(
  content: any,
  context: {
    url: string
    sourceId: string
    phase: 'extraction' | 'preprocessing' | 'chunking'
  }
): ValidationResult {
  const phase = `[ContentValidation:${context.phase}]`
  
  console.log(`${phase} Validating content for ${context.url}`)
  console.log(`${phase}    Source ID: ${context.sourceId}`)
  
  // === STEP 1: Controlla tipo ===
  const actualType = typeof content
  const isNull = content === null
  const isUndefined = content === undefined
  
  console.log(`${phase}    Type: ${actualType}`)
  console.log(`${phase}    Is null: ${isNull}`)
  console.log(`${phase}    Is undefined: ${isUndefined}`)
  
  const metadata = {
    originalType: actualType,
    originalLength: 0,
    hasContent: false,
    isEmpty: true,
    isString: actualType === 'string'
  }
  
  // === STEP 2: Reject non-string types ===
  if (isNull || isUndefined) {
    console.log(`${phase}    ❌ INVALID: Content is ${isNull ? 'null' : 'undefined'}`)
    return {
      valid: false,
      reason: `Content is ${isNull ? 'null' : 'undefined'}`,
      metadata
    }
  }
  
  if (actualType !== 'string') {
    console.log(`${phase}    ❌ INVALID: Content is ${actualType}, not string`)
    console.log(`${phase}    Value:`, JSON.stringify(content).substring(0, 200))
    return {
      valid: false,
      reason: `Content is ${actualType}, expected string`,
      metadata
    }
  }
  
  // === STEP 3: Controlla lunghezza ===
  const originalLength = content.length
  metadata.originalLength = originalLength
  metadata.hasContent = originalLength > 0
  
  console.log(`${phase}    Original length: ${originalLength} chars`)
  
  if (originalLength === 0) {
    console.log(`${phase}    ❌ INVALID: Empty string`)
    return {
      valid: false,
      reason: 'Empty string (length = 0)',
      metadata
    }
  }
  
  // === STEP 4: Sanitizza e normalizza ===
  let sanitized = content
  
  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '')
  
  // Normalize whitespace
  sanitized = sanitized.trim()
  
  // Normalize Unicode
  try {
    sanitized = sanitized.normalize('NFC')
  } catch (e) {
    console.log(`${phase}    ⚠️ Unicode normalization failed, continuing...`)
  }
  
  const sanitizedLength = sanitized.length
  ;(metadata as any).sanitizedLength = sanitizedLength
  metadata.isEmpty = sanitizedLength === 0
  
  console.log(`${phase}    Sanitized length: ${sanitizedLength} chars`)
  
  // === STEP 5: Controlla se è solo whitespace ===
  if (sanitizedLength === 0) {
    console.log(`${phase}    ❌ INVALID: Only whitespace`)
    return {
      valid: false,
      reason: 'Content is only whitespace after trimming',
      metadata
    }
  }
  
  // === STEP 6: Controlla lunghezza minima ===
  const MIN_LENGTH = 50 // Minimo 50 caratteri
  if (sanitizedLength < MIN_LENGTH) {
    console.log(`${phase}    ❌ INVALID: Too short (${sanitizedLength} < ${MIN_LENGTH})`)
    console.log(`${phase}    Preview: "${sanitized.substring(0, 50)}"`)
    return {
      valid: false,
      reason: `Content too short (${sanitizedLength} chars, minimum ${MIN_LENGTH})`,
      metadata
    }
  }
  
  // === STEP 7: Verifica che contenga parole reali ===
  const words = sanitized.split(/\s+/)
  const realWords = words.filter((w: string) => /[a-zA-Z]{2,}/.test(w))
  const wordCount = realWords.length
  
  console.log(`${phase}    Word count: ${wordCount}`)
  
  const MIN_WORDS = 10
  if (wordCount < MIN_WORDS) {
    console.log(`${phase}    ❌ INVALID: Too few words (${wordCount} < ${MIN_WORDS})`)
    console.log(`${phase}    Preview: "${sanitized.substring(0, 100)}"`)
    return {
      valid: false,
      reason: `Too few words (${wordCount}, minimum ${MIN_WORDS})`,
      metadata
    }
  }
  
  // === STEP 8: Success! ===
  console.log(`${phase}    ✅ VALID: ${sanitizedLength} chars, ${wordCount} words`)
  console.log(`${phase}    First 150 chars: "${sanitized.substring(0, 150)}..."`)
  
  return {
    valid: true,
    sanitized,
    metadata
  }
}

/**
 * Valida un array di chunks prima dell'embedding
 */
export function validateChunks(
  chunks: any[],
  context: {
    sourceId: string
    url: string
  }
): {
  validChunks: Array<{ text: string; index: number }>
  invalidCount: number
  validationErrors: Array<{ index: number; reason: string }>
} {
  console.log(`\n[ChunkValidation] Validating ${chunks.length} chunks for ${context.url}`)
  
  const validChunks: Array<{ text: string; index: number }> = []
  const validationErrors: Array<{ index: number; reason: string }> = []
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    
    // Get text from chunk (handle different formats)
    let text: any
    if (typeof chunk === 'string') {
      text = chunk
    } else if (chunk && typeof chunk === 'object') {
      text = chunk.text || chunk.content || chunk.textContent
    } else {
      text = undefined
    }
    
    const validation = validateAndSanitizeContent(text, {
      url: context.url,
      sourceId: context.sourceId,
      phase: 'chunking'
    })
    
    if (validation.valid && validation.sanitized) {
      validChunks.push({
        text: validation.sanitized,
        index: i
      })
    } else {
      console.log(`[ChunkValidation] ❌ Chunk ${i} invalid: ${validation.reason}`)
      validationErrors.push({
        index: i,
        reason: validation.reason || 'Unknown error'
      })
    }
  }
  
  console.log(`[ChunkValidation] Result: ${validChunks.length} valid, ${validationErrors.length} invalid\n`)
  
  return {
    validChunks,
    invalidCount: validationErrors.length,
    validationErrors
  }
}

/**
 * Log dettagliato di una pagina prima del processamento
 */
export function logPagePreProcessing(page: any, context: { jobId: string }) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`[PreProcessing] Job ${context.jobId}`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`URL: ${page.url}`)
  console.log(`Title: ${page.title || 'N/A'}`)
  console.log(`\nContent Analysis:`)
  console.log(`  Type: ${typeof page.textContent}`)
  console.log(`  Is null: ${page.textContent === null}`)
  console.log(`  Is undefined: ${page.textContent === undefined}`)
  console.log(`  Is empty string: ${page.textContent === ''}`)
  
  if (typeof page.textContent === 'string') {
    console.log(`  Length: ${page.textContent.length} characters`)
    console.log(`  Trimmed length: ${page.textContent.trim().length}`)
    console.log(`  Word count: ${page.textContent.split(/\s+/).filter((w: string) => w.length > 0).length}`)
    console.log(`\nFirst 200 characters:`)
    console.log(`"${page.textContent.substring(0, 200)}..."`)
  } else {
    console.log(`  ❌ Content is not a string!`)
    console.log(`  Actual value type: ${typeof page.textContent}`)
    console.log(`  Actual value: ${JSON.stringify(page.textContent).substring(0, 200)}`)
  }
  
  console.log(`\nFull page object keys: ${Object.keys(page).join(', ')}`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)
}
