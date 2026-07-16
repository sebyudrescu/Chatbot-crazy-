/**
 * Dynamic Quick Replies Generator
 * 
 * Generates contextual action buttons that adapt to:
 * - What was just discussed (entities, services, products)
 * - Conversation stage (first message vs follow-up)
 * - User intent (exploring, purchasing, support)
 * - Business context (available services, contact options)
 * 
 * Goal: Reduce cognitive load - let users click instead of type
 */

import type { BusinessContext } from './business-context'
import type { IntentType } from './intent-classifier'

export interface QuickReply {
  id: string                    // Unique identifier for tracking
  text: string                  // Button label (short, 2-5 words)
  action: QuickReplyAction      // What happens when clicked
  payload?: any                 // Additional data for the action
  icon?: string                 // Optional emoji/icon
  priority: number              // 1-10, higher = more important
}

export type QuickReplyAction = 
  | 'ask_question'       // Ask a follow-up question
  | 'explore_service'    // View service details
  | 'request_quote'      // Request pricing/quote
  | 'contact'            // Contact human/support
  | 'view_products'      // Browse products
  | 'schedule_demo'      // Book a demo/meeting
  | 'download_info'      // Download brochure/info
  | 'faq'                // View FAQ
  | 'other'              // Generic "something else"

export interface QuickReplyContext {
  intentType: IntentType
  responseContent: string
  conversationStage: number
  businessContext?: BusinessContext
  extractedEntities?: Array<{
    type: string
    name: string
    id?: string
  }>
  userGoalDetected?: 'explore' | 'purchase' | 'support' | 'inform' | 'unknown'
}

export interface QuickReplyResult {
  replies: QuickReply[]
  reasoning: string
  maxDisplay: number  // How many to show at once
}

/**
 * Main function: Generate contextual quick replies
 */
export function generateQuickReplies(
  context: QuickReplyContext
): QuickReplyResult {
  
  console.log(`[Quick Replies] Generating for intent: ${context.intentType}, stage: ${context.conversationStage}`)
  
  const replies: QuickReply[] = []
  
  // STRATEGY 1: Identity questions - Guide to exploration
  if (context.intentType === 'identity_question') {
    replies.push(...generateIdentityQuickReplies(context))
  }
  
  // STRATEGY 2: Questions with entities - Offer deeper dive
  else if (context.intentType === 'question' && context.extractedEntities && context.extractedEntities.length > 0) {
    replies.push(...generateEntityQuickReplies(context))
  }
  
  // STRATEGY 3: Early conversation - Offer exploration
  else if (context.conversationStage <= 3) {
    replies.push(...generateExplorationQuickReplies(context))
  }
  
  // STRATEGY 4: Later conversation - Offer action
  else if (context.conversationStage > 3) {
    replies.push(...generateActionQuickReplies(context))
  }
  
  // ALWAYS ADD: Contact option (low priority, USER PERSPECTIVE)
  if (!replies.find(r => r.action === 'contact')) {
    replies.push({
      id: 'contact-human',
      text: 'Voglio parlare con voi',
      action: 'contact',
      priority: 3
    })
  }
  
  // Sort by priority (highest first)
  replies.sort((a, b) => b.priority - a.priority)
  
  // Limit to top 2-3 options (max 3, less is better)
  const maxDisplay = 3
  const topReplies = replies.slice(0, maxDisplay)
  
  console.log(`[Quick Replies] Generated ${replies.length} options, showing top ${topReplies.length}`)
  
  return {
    replies: topReplies,
    reasoning: `Generated ${replies.length} quick replies for ${context.intentType}`,
    maxDisplay
  }
}

/**
 * Generate quick replies for identity questions
 * Goal: Guide user to explore services or request quote
 */
function generateIdentityQuickReplies(context: QuickReplyContext): QuickReply[] {
  const replies: QuickReply[] = []
  
  // Option 1: View services (USER PERSPECTIVE)
  if (context.businessContext?.mainServices && context.businessContext.mainServices.length > 0) {
    replies.push({
      id: 'view-services',
      text: 'Voglio sapere di più sui servizi',
      action: 'explore_service',
      priority: 10
    })
  } else {
    replies.push({
      id: 'view-services-generic',
      text: 'Voglio sapere cosa offrite',
      action: 'explore_service',
      priority: 9
    })
  }
  
  // Option 2: Request quote (USER PERSPECTIVE)
  replies.push({
    id: 'request-quote',
    text: 'Vorrei un preventivo',
    action: 'request_quote',
    priority: 8
  })
  
  return replies
}

/**
 * Generate quick replies when specific entities are mentioned
 * Goal: Offer deep dive or action on that entity
 */
function generateEntityQuickReplies(context: QuickReplyContext): QuickReply[] {
  const replies: QuickReply[] = []
  
  if (!context.extractedEntities || context.extractedEntities.length === 0) {
    return replies
  }
  
  const entity = context.extractedEntities[0]  // Focus on first entity
  
  // Service entity
  if (entity.type === 'service') {
    replies.push({
      id: `service-details-${entity.id || entity.name}`,
      text: `Vorrei sapere di più su ${entity.name}`,
      action: 'ask_question',
      payload: { entityId: entity.id, entityName: entity.name, entityType: 'service' },
      priority: 10
    })
    
    replies.push({
      id: `service-pricing-${entity.id || entity.name}`,
      text: 'Vorrei sapere quanto costa',
      action: 'request_quote',
      payload: { service: entity.name },
      priority: 9
    })
  }
  
  // Product entity
  else if (entity.type === 'product') {
    replies.push({
      id: `product-details-${entity.id || entity.name}`,
      text: `Voglio sapere di più su ${entity.name}`,
      action: 'ask_question',
      payload: { entityId: entity.id, entityName: entity.name, entityType: 'product' },
      priority: 10
    })
    
    replies.push({
      id: 'view-all-products',
      text: 'Quali altri prodotti avete?',
      action: 'view_products',
      priority: 8
    })
  }
  
  // Generic entity - offer exploration
  else {
    replies.push({
      id: 'explore-related',
      text: "C'è altro che dovrei sapere?",
      action: 'ask_question',
      payload: { relatedTo: entity.name },
      priority: 7
    })
  }
  
  return replies
}

/**
 * Generate quick replies for early conversation
 * Goal: Help user explore and understand offerings
 */
function generateExplorationQuickReplies(context: QuickReplyContext): QuickReply[] {
  const replies: QuickReply[] = []
  
  // Offer services
  if (context.businessContext?.mainServices && context.businessContext.mainServices.length > 0) {
    // If we have specific services, offer them
    const topServices = context.businessContext.mainServices.slice(0, 2)
    
    for (const service of topServices) {
      replies.push({
        id: `service-${service.toLowerCase().replace(/\s+/g, '-')}`,
        text: `Voglio sapere di più su ${service}`,
        action: 'explore_service',
        payload: { service },
        priority: 9
      })
    }
  }
  
  // General exploration (USER PERSPECTIVE)
  replies.push({
    id: 'view-all-services',
    text: 'Quali servizi offrite?',
    action: 'explore_service',
    priority: 8
  })
  
  replies.push({
    id: 'how-we-work',
    text: 'Come funziona il vostro processo?',
    action: 'ask_question',
    payload: { topic: 'process' },
    priority: 7
  })
  
  return replies
}

/**
 * Generate quick replies for later conversation
 * Goal: Push toward conversion actions
 */
function generateActionQuickReplies(context: QuickReplyContext): QuickReply[] {
  const replies: QuickReply[] = []
  
  // Strong call to action (USER PERSPECTIVE)
  replies.push({
    id: 'get-quote',
    text: 'Vorrei un preventivo',
    action: 'request_quote',
    priority: 10
  })
  
  replies.push({
    id: 'schedule-call',
    text: 'Voglio prenotare una call',
    action: 'schedule_demo',
    priority: 9
  })
  
  replies.push({
    id: 'view-case-studies',
    text: 'Avete casi di successo?',
    action: 'ask_question',
    payload: { topic: 'case_studies' },
    priority: 7
  })
  
  return replies
}

/**
 * Utility: Convert quick reply to suggested question
 * When user clicks a quick reply, this generates the actual question to send
 */
export function quickReplyToQuestion(reply: QuickReply): string {
  
  switch (reply.action) {
    case 'explore_service':
      if (reply.payload?.service) {
        return `Parlami del servizio ${reply.payload.service}`
      }
      return 'Quali servizi offrite?'
      
    case 'request_quote':
      if (reply.payload?.service) {
        return `Vorrei un preventivo per ${reply.payload.service}`
      }
      return 'Vorrei ricevere un preventivo personalizzato'
      
    case 'contact':
      return 'Come posso contattarvi?'
      
    case 'view_products':
      return 'Quali prodotti avete disponibili?'
      
    case 'schedule_demo':
      return 'Vorrei prenotare una chiamata con voi'
      
    case 'ask_question':
      if (reply.payload?.entityName) {
        return `Dimmi di più su ${reply.payload.entityName}`
      }
      if (reply.payload?.topic === 'process') {
        return 'Come funziona il vostro processo?'
      }
      if (reply.payload?.topic === 'case_studies') {
        return 'Avete casi di successo da mostrarmi?'
      }
      return 'Dimmi di più'
      
    case 'faq':
      return 'Quali sono le domande frequenti?'
      
    default:
      return 'Dimmi di più'
  }
}

/**
 * Validate quick replies quality
 */
export function validateQuickReplies(replies: QuickReply[]): { valid: boolean; reason?: string } {
  
  // Must have at least 2 options
  if (replies.length < 2) {
    return { valid: false, reason: 'Too few options' }
  }
  
  // Max 5 options
  if (replies.length > 5) {
    return { valid: false, reason: 'Too many options' }
  }
  
  // Text must be short (max 25 chars)
  for (const reply of replies) {
    if (reply.text.length > 25) {
      return { valid: false, reason: `Text too long: "${reply.text}"` }
    }
  }
  
  // Must have unique IDs
  const ids = new Set(replies.map(r => r.id))
  if (ids.size !== replies.length) {
    return { valid: false, reason: 'Duplicate IDs' }
  }
  
  return { valid: true }
}

/**
 * Utility: Should we show quick replies for this intent?
 */
export function shouldShowQuickReplies(
  intentType: IntentType,
  conversationStage: number
): boolean {
  
  // ALWAYS show for identity questions (guide to action)
  if (intentType === 'identity_question') {
    return true
  }
  
  // Show for questions
  if (intentType === 'question') {
    return true
  }
  
  // Show for greetings if first message
  if (intentType === 'greeting' && conversationStage === 1) {
    return true
  }
  
  // Don't show for chitchat (not useful)
  if (intentType === 'chitchat') {
    return false
  }
  
  // Don't show for escalation (user wants human)
  if (intentType === 'escalation') {
    return false
  }
  
  // Show if early in conversation
  return conversationStage <= 5
}
