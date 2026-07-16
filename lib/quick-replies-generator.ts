/**
 * Quick Replies Generator
 * Generates contextual quick reply suggestions based on conversation context
 */

export interface QuickReply {
  id: string
  text: string
  category?: 'faq' | 'product' | 'support' | 'general'
}

/**
 * Generate quick replies based on conversation context
 */
export function generateQuickReplies(
  context: {
    lastUserMessage?: string
    lastAssistantMessage?: string
    conversationLength: number
    topics?: string[]
    userIntent?: string
  }
): QuickReply[] {
  const { conversationLength, userIntent, lastAssistantMessage } = context

  // Initial greeting suggestions
  if (conversationLength === 0) {
    return [
      { id: 'q1', text: 'Come posso iniziare?', category: 'general' },
      { id: 'q2', text: 'Quali servizi offrite?', category: 'product' },
      { id: 'q3', text: 'Ho bisogno di supporto', category: 'support' },
      { id: 'q4', text: 'Vorrei parlare con un operatore', category: 'support' },
    ]
  }

  // Context-based suggestions
  const replies: QuickReply[] = []

  // Product/pricing related
  if (lastAssistantMessage?.toLowerCase().includes('prezzo') || 
      lastAssistantMessage?.toLowerCase().includes('costo') ||
      lastAssistantMessage?.toLowerCase().includes('prodotto')) {
    replies.push(
      { id: 'q_price1', text: 'Ci sono sconti disponibili?', category: 'product' },
      { id: 'q_price2', text: 'Quali sono i metodi di pagamento?', category: 'product' }
    )
  }

  // Support related
  if (userIntent === 'support' || lastAssistantMessage?.toLowerCase().includes('problema')) {
    replies.push(
      { id: 'q_support1', text: 'Come posso contattarvi?', category: 'support' },
      { id: 'q_support2', text: 'Parla con un operatore umano', category: 'support' }
    )
  }

  // General follow-ups
  replies.push(
    { id: 'q_general1', text: 'Dimmi di più', category: 'general' },
    { id: 'q_general2', text: "C'è altro che dovresti sapere?", category: 'general' }
  )

  // Always offer human escalation if conversation is long
  if (conversationLength >= 5) {
    replies.push(
      { id: 'q_escalate', text: 'Vorrei parlare con una persona', category: 'support' }
    )
  }

  // Return max 4 suggestions
  return replies.slice(0, 4)
}

/**
 * Generate FAQ-based quick replies for specific domains
 */
export function generateFAQQuickReplies(domain: 'ecommerce' | 'support' | 'sales'): QuickReply[] {
  const faqs = {
    ecommerce: [
      { id: 'faq_ec1', text: 'Tempi di consegna?', category: 'faq' as const },
      { id: 'faq_ec2', text: 'Policy di reso?', category: 'faq' as const },
      { id: 'faq_ec3', text: 'Tracciamento ordine', category: 'faq' as const },
      { id: 'faq_ec4', text: 'Metodi di pagamento', category: 'faq' as const },
    ],
    support: [
      { id: 'faq_sp1', text: 'Come creo un account?', category: 'faq' as const },
      { id: 'faq_sp2', text: 'Password dimenticata', category: 'faq' as const },
      { id: 'faq_sp3', text: 'Problema tecnico', category: 'faq' as const },
      { id: 'faq_sp4', text: 'Contatta il supporto', category: 'faq' as const },
    ],
    sales: [
      { id: 'faq_sl1', text: 'Prezzi e piani', category: 'faq' as const },
      { id: 'faq_sl2', text: 'Demo del prodotto', category: 'faq' as const },
      { id: 'faq_sl3', text: 'Confronto funzionalità', category: 'faq' as const },
      { id: 'faq_sl4', text: 'Richiedi preventivo', category: 'faq' as const },
    ],
  }

  return faqs[domain] || []
}

/**
 * Detect if quick reply triggers escalation
 */
export function shouldEscalate(quickReplyText: string): boolean {
  const escalationKeywords = [
    'operatore',
    'persona',
    'umano',
    'agente',
    'supporto dal vivo',
    'parlare con qualcuno',
    'assistenza diretta',
  ]

  return escalationKeywords.some(keyword => 
    quickReplyText.toLowerCase().includes(keyword)
  )
}
