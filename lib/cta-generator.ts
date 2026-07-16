/**
 * Contextual CTA Generator
 * Generates contextual call-to-action buttons based on conversation content
 */

export interface CTA {
  id: string
  type: 'button' | 'link' | 'form' | 'banner'
  label: string
  action: string // URL or action identifier
  variant?: 'primary' | 'secondary' | 'success' | 'info'
  icon?: string
  metadata?: Record<string, any>
}

/**
 * Generate CTAs based on conversation context
 */
export function generateContextualCTAs(context: {
  lastAssistantMessage: string
  topics?: string[]
  userIntent?: string
  productMentioned?: string
}): CTA[] {
  const { lastAssistantMessage, userIntent, productMentioned } = context
  const ctaList: CTA[] = []

  const lowerMessage = lastAssistantMessage.toLowerCase()

  // Product-related CTAs
  if (productMentioned || lowerMessage.includes('prodotto') || lowerMessage.includes('articolo')) {
    ctaList.push({
      id: 'cta_cart',
      type: 'button',
      label: 'Aggiungi al carrello',
      action: '/cart/add',
      variant: 'primary',
      icon: '🛒',
      metadata: { product: productMentioned },
    })

    ctaList.push({
      id: 'cta_details',
      type: 'link',
      label: 'Vedi dettagli prodotto',
      action: `/products/${productMentioned}`,
      variant: 'secondary',
      icon: '🔍',
    })
  }

  // Pricing/demo related
  if (lowerMessage.includes('prezzo') || lowerMessage.includes('costo') || lowerMessage.includes('piano')) {
    ctaList.push({
      id: 'cta_pricing',
      type: 'button',
      label: 'Vedi piani e prezzi',
      action: '/pricing',
      variant: 'info',
      icon: '💰',
    })
  }

  // Demo/trial
  if (lowerMessage.includes('demo') || lowerMessage.includes('prova') || lowerMessage.includes('trial')) {
    ctaList.push({
      id: 'cta_trial',
      type: 'button',
      label: 'Inizia prova gratuita',
      action: '/signup?trial=true',
      variant: 'success',
      icon: '🚀',
    })
  }

  // Contact/support
  if (userIntent === 'support' || lowerMessage.includes('contatt') || lowerMessage.includes('assistenza')) {
    ctaList.push({
      id: 'cta_contact',
      type: 'button',
      label: 'Contattaci',
      action: '/contact',
      variant: 'secondary',
      icon: '📧',
    })
  }

  // Booking/scheduling
  if (lowerMessage.includes('appuntamento') || lowerMessage.includes('consulenza') || lowerMessage.includes('meeting')) {
    ctaList.push({
      id: 'cta_schedule',
      type: 'button',
      label: 'Prenota una consulenza',
      action: '/schedule',
      variant: 'primary',
      icon: '📅',
    })
  }

  // Newsletter/updates
  if (lowerMessage.includes('aggiornament') || lowerMessage.includes('newsletter') || lowerMessage.includes('novità')) {
    ctaList.push({
      id: 'cta_newsletter',
      type: 'form',
      label: 'Iscriviti alla newsletter',
      action: '/newsletter/subscribe',
      variant: 'info',
      icon: '📬',
    })
  }

  // Download/documentation
  if (lowerMessage.includes('documentazione') || lowerMessage.includes('guida') || lowerMessage.includes('manuale')) {
    ctaList.push({
      id: 'cta_docs',
      type: 'link',
      label: 'Scarica la documentazione',
      action: '/docs/download',
      variant: 'secondary',
      icon: '📄',
    })
  }

  return ctaList
}

/**
 * Generate promotional banner CTAs
 */
export function generatePromotionalCTA(promoType: 'discount' | 'feature' | 'event'): CTA {
  const promos = {
    discount: {
      id: 'cta_promo_discount',
      type: 'banner' as const,
      label: '🎉 Sconto 20% per nuovi clienti - Usa codice: NUOVO20',
      action: '/checkout?promo=NUOVO20',
      variant: 'success' as const,
      metadata: { promoCode: 'NUOVO20', discount: 0.2 },
    },
    feature: {
      id: 'cta_promo_feature',
      type: 'banner' as const,
      label: '✨ Nuove funzionalità disponibili! Scopri cosa c\'è di nuovo',
      action: '/whats-new',
      variant: 'info' as const,
    },
    event: {
      id: 'cta_promo_event',
      type: 'banner' as const,
      label: '📢 Webinar gratuito: Registrati ora',
      action: '/events/register',
      variant: 'primary' as const,
    },
  }

  return promos[promoType]
}
