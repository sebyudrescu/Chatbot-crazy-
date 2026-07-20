export interface AgentInstructionConfig {
  role?: string
  objective?: string
  personality?: string
  rules?: string[]
  forbiddenTopics?: string[]
  forbiddenResponses?: string[]
  handoffTriggers?: string[]
  leadCollectionFields?: string[]
  language?: string
  tone?: string
  responseLength?: 'short' | 'balanced' | 'detailed'
  fallbackMessage?: string
  handoffMessage?: string
}

function numbered(title: string, values?: string[]) {
  const items = (values || []).map(value => value.trim()).filter(Boolean)
  return items.length ? `${title}:\n${items.map((value, index) => `${index + 1}. ${value}`).join('\n')}` : ''
}

export function appendAgentInstructions(basePrompt: string, config: AgentInstructionConfig): string {
  const lengthLabels = {
    short: 'Risposte brevi e dirette, normalmente entro 2-3 frasi.',
    balanced: 'Risposte equilibrate: complete ma senza dettagli non necessari.',
    detailed: 'Risposte approfondite e ben strutturate quando il contesto lo richiede.',
  }

  const lines = [
    config.role && `Ruolo: ${config.role}`,
    config.objective && `Obiettivo: ${config.objective}`,
    config.personality && `Personalità: ${config.personality}`,
    config.language && `Lingua: rispondi in ${config.language}, salvo richiesta esplicita dell'utente.`,
    config.tone && `Tono di voce: ${config.tone}.`,
    config.responseLength && lengthLabels[config.responseLength],
    config.fallbackMessage && `Quando le informazioni non sono sufficienti usa questo fallback, adattandolo al contesto senza inventare: "${config.fallbackMessage}"`,
    config.handoffMessage && `Quando attivi il passaggio a un operatore comunica esattamente questo messaggio: "${config.handoffMessage}"`,
    numbered('Regole obbligatorie', config.rules),
    numbered('Argomenti vietati: non fornire istruzioni o contenuti su questi temi; usa il messaggio di fallback e proponi assistenza umana', config.forbiddenTopics),
    numbered('Risposte vietate: non formulare mai risposte che contengano o realizzino queste richieste', config.forbiddenResponses),
    numbered('Passa a un operatore umano quando si verifica una di queste condizioni', config.handoffTriggers),
    config.leadCollectionFields?.length && `Raccolta lead: quando è pertinente, chiedi in modo naturale e con consenso esplicito questi dati: ${config.leadCollectionFields.join(', ')}. Non richiedere dati non necessari e non inventare valori.`,
  ].filter(Boolean)

  return lines.length > 0
    ? `${basePrompt}\n\n---\n\n# CONFIGURAZIONE SPECIFICA DELL'AGENTE\n\n${lines.join('\n')}`
    : basePrompt
}
