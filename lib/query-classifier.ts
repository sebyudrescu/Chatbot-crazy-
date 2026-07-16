/**
 * Query Classifier - Classifica le query per determinare parametri OpenAI ottimali
 * Distingue tra query fattuali, creative e conversazionali
 */

export type QueryType = 'factual' | 'creative' | 'conversational' | 'complex'
export type QueryComplexity = 'simple' | 'medium' | 'complex'

export interface QueryClassification {
  type: QueryType
  complexity: QueryComplexity
  confidence: number
  reasoning: string
}

// Keywords per identificare query fattuali (richiedono precisione)
const FACTUAL_KEYWORDS = [
  // Domande dirette
  'quanto', 'quando', 'dove', 'quale', 'quali', 'chi', 'cosa', 'come',
  // Info specifiche
  'prezzo', 'costo', 'costa', 'stato', 'status', 'ordine', 'numero',
  'orario', 'orari', 'apertura', 'chiusura', 'indirizzo', 'email', 'telefono',
  'data', 'scadenza', 'durata', 'tempo', 'giorni', 'settimana', 'mese',
  // Info tecniche
  'funziona', 'fare', 'utilizzare', 'usare', 'attivare', 'configurare',
  'installare', 'problema', 'errore', 'non funziona',
  // Info legali/policy
  'garanzia', 'reso', 'rimborso', 'disdetta', 'cancellazione', 'policy',
]

// Keywords per identificare query creative (permettono libertà)
const CREATIVE_KEYWORDS = [
  'suggerisci', 'suggerimento', 'consiglia', 'consiglio', 'proponi', 'proposta',
  'crea', 'genera', 'scrivi', 'redigi', 'componi',
  'idea', 'idee', 'possibilità', 'alternative', 'opzioni',
  'claim', 'slogan', 'messaggio', 'testo', 'contenuto',
  'strategia', 'piano', 'approccio', 'soluzione creativa',
  'brainstorm', 'ispirami', 'inventa', 'immagina',
]

// Indicatori di complessità
const COMPLEXITY_INDICATORS = {
  simple: ['si', 'no', 'grazie', 'ok', 'ciao', 'buongiorno'],
  complex: [
    'dettagliatamente', 'spiegami', 'approfondisci', 'completo',
    'tutti i', 'tutte le', 'differenze', 'confronta', 'confronto',
    'pro e contro', 'vantaggi e svantaggi', 'step by step', 'passo passo',
    'processo completo', 'documentazione', 'guida completa',
  ]
}

/**
 * Classifica una query utente
 */
export function classifyQuery(query: string): QueryClassification {
  const lowerQuery = query.toLowerCase().trim()
  const words = lowerQuery.split(/\s+/)
  
  // Check length
  const wordCount = words.length
  const charCount = lowerQuery.length
  
  // 1. Detect Factual Queries
  const factualMatches = FACTUAL_KEYWORDS.filter(kw => 
    lowerQuery.includes(kw)
  ).length
  
  // 2. Detect Creative Queries
  const creativeMatches = CREATIVE_KEYWORDS.filter(kw => 
    lowerQuery.includes(kw)
  ).length
  
  // 3. Detect Complexity
  let complexity: QueryComplexity = 'medium'
  
  const simpleMatches = COMPLEXITY_INDICATORS.simple.filter(kw =>
    lowerQuery === kw || lowerQuery.startsWith(kw + ' ')
  ).length
  
  const complexMatches = COMPLEXITY_INDICATORS.complex.filter(kw =>
    lowerQuery.includes(kw)
  ).length
  
  if (simpleMatches > 0 || wordCount <= 3) {
    complexity = 'simple'
  } else if (complexMatches > 0 || wordCount > 20 || charCount > 150) {
    complexity = 'complex'
  }
  
  // 4. Determine Query Type
  let type: QueryType = 'conversational'
  let confidence = 0.5
  let reasoning = 'Default conversational'
  
  if (creativeMatches > factualMatches && creativeMatches > 0) {
    type = 'creative'
    confidence = Math.min(0.9, 0.5 + creativeMatches * 0.15)
    reasoning = `Detected ${creativeMatches} creative keywords`
  } else if (factualMatches > 0) {
    type = 'factual'
    confidence = Math.min(0.9, 0.5 + factualMatches * 0.15)
    reasoning = `Detected ${factualMatches} factual keywords`
  } else if (complexity === 'complex') {
    type = 'complex'
    confidence = 0.7
    reasoning = 'Long query requiring detailed explanation'
  } else {
    // Conversational
    confidence = 0.6
    reasoning = 'General conversational query'
  }
  
  // 5. Special patterns
  if (lowerQuery.includes('?')) {
    if (type === 'conversational') {
      type = 'factual'
      reasoning += ' (question mark detected)'
    }
    confidence = Math.min(0.95, confidence + 0.1)
  }
  
  return {
    type,
    complexity,
    confidence,
    reasoning,
  }
}

/**
 * Test helper function
 */
export function testQueryClassification(query: string): void {
  const result = classifyQuery(query)
  console.log(`Query: "${query}"`)
  console.log(`Type: ${result.type} (${result.confidence.toFixed(2)})`)
  console.log(`Complexity: ${result.complexity}`)
  console.log(`Reasoning: ${result.reasoning}`)
  console.log('---')
}
