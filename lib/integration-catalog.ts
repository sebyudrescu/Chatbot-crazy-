export interface IntegrationDefinition {
  provider: string
  name: string
  category: 'channels' | 'crm' | 'calendar' | 'automation' | 'commerce' | 'support' | 'data'
  description: string
  color: string
  initials: string
  mode: 'native' | 'configuration' | 'planned'
  fields?: Array<{ key: string; label: string; placeholder: string; type?: 'url' | 'text' | 'secret'; required?: boolean }>
}

export const INTEGRATION_CATALOG: IntegrationDefinition[] = [
  { provider: 'widget', name: 'Widget sito web', category: 'channels', description: 'Chat integrata nel sito del cliente con domini autorizzati.', color: '#633cff', initials: 'W', mode: 'native' },
  { provider: 'public-page', name: 'Pagina chat', category: 'channels', description: 'Link pubblico completo per parlare con l’agente.', color: '#111827', initials: 'P', mode: 'native' },
  { provider: 'webhook', name: 'Webhook HTTPS', category: 'automation', description: 'Invia eventi firmati delle conversazioni a un endpoint esterno sicuro.', color: '#f97316', initials: 'WH', mode: 'configuration', fields: [{ key: 'endpoint', label: 'Endpoint HTTPS', placeholder: 'https://automazioni.cliente.it/webhook', type: 'url' }, { key: 'secret', label: 'Segreto firma HMAC', placeholder: 'Almeno 16 caratteri', type: 'secret', required: false }, { key: 'events', label: 'Eventi (opzionale)', placeholder: 'lead.captured, conversation.handoff_requested', type: 'text', required: false }] },
  { provider: 'calendly', name: 'Calendly', category: 'calendar', description: 'Mostra un collegamento reale per prenotare un appuntamento.', color: '#006bff', initials: 'C', mode: 'configuration', fields: [{ key: 'bookingUrl', label: 'Link prenotazione', placeholder: 'https://calendly.com/cliente/consulenza', type: 'url' }] },
  { provider: 'whatsapp', name: 'WhatsApp Business', category: 'channels', description: 'Risposte automatiche tramite WhatsApp Cloud API ed Embedded Signup Meta.', color: '#25d366', initials: 'WA', mode: 'native' },
  { provider: 'instagram', name: 'Instagram Direct', category: 'channels', description: 'Messaggi Direct tramite Instagram Business Login e webhook Meta.', color: '#e1306c', initials: 'IG', mode: 'native' },
  { provider: 'messenger', name: 'Messenger', category: 'channels', description: 'Assistenza tramite pagine Facebook.', color: '#0084ff', initials: 'M', mode: 'planned' },
  { provider: 'telegram', name: 'Telegram', category: 'channels', description: 'Bot Telegram con conversazioni sincronizzate.', color: '#229ed9', initials: 'TG', mode: 'planned' },
  { provider: 'gmail', name: 'Gmail', category: 'channels', description: 'Invio e gestione email operative.', color: '#ea4335', initials: 'G', mode: 'planned' },
  { provider: 'google-calendar', name: 'Google Calendar', category: 'calendar', description: 'Disponibilità e appuntamenti in calendario.', color: '#4285f4', initials: 'GC', mode: 'planned' },
  { provider: 'hubspot', name: 'HubSpot CRM', category: 'crm', description: 'Crea e aggiorna contatti, lead e attività.', color: '#ff7a59', initials: 'H', mode: 'planned' },
  { provider: 'salesforce', name: 'Salesforce', category: 'crm', description: 'Sincronizzazione contatti e opportunità.', color: '#00a1e0', initials: 'SF', mode: 'planned' },
  { provider: 'pipedrive', name: 'Pipedrive', category: 'crm', description: 'Lead e deal nella pipeline commerciale.', color: '#1f1f1f', initials: 'PD', mode: 'planned' },
  { provider: 'google-sheets', name: 'Google Sheets', category: 'data', description: 'Registra lead e risultati in un foglio.', color: '#0f9d58', initials: 'GS', mode: 'planned' },
  { provider: 'notion', name: 'Notion', category: 'data', description: 'Fonti e database Notion sincronizzati.', color: '#111111', initials: 'N', mode: 'planned' },
  { provider: 'stripe', name: 'Stripe', category: 'commerce', description: 'Link di pagamento e stato transazioni.', color: '#635bff', initials: 'S', mode: 'planned' },
  { provider: 'shopify', name: 'Shopify', category: 'commerce', description: 'Collega il negozio con accesso ufficiale e sincronizza prodotti, varianti, prezzi e disponibilità.', color: '#7ab55c', initials: 'SH', mode: 'configuration', fields: [{ key: 'shopUrl', label: 'Dominio myshopify.com', placeholder: 'nome-negozio.myshopify.com', type: 'text' }] },
  { provider: 'woocommerce', name: 'WooCommerce', category: 'commerce', description: 'Il cliente autorizza LitX da WordPress; catalogo, prodotti e ordini si aggiornano automaticamente.', color: '#96588a', initials: 'WC', mode: 'configuration', fields: [{ key: 'storeUrl', label: 'URL negozio WooCommerce', placeholder: 'https://shop.cliente.it', type: 'url' }] },
  { provider: 'zapier', name: 'Zapier', category: 'automation', description: 'Automazioni con migliaia di applicazioni.', color: '#ff4f00', initials: 'Z', mode: 'planned' },
  { provider: 'zendesk', name: 'Zendesk', category: 'support', description: 'Ticket e knowledge base del supporto.', color: '#03363d', initials: 'ZD', mode: 'planned' },
]

export const findIntegration = (provider: string) => INTEGRATION_CATALOG.find(item => item.provider === provider)

export function safeHttpsUrl(value: string) {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    if (url.protocol !== 'https:' || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local') || /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null
    return url
  } catch { return null }
}
