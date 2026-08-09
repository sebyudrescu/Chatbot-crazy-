import assert from 'node:assert/strict'

import { conversationHistoryForIntent } from '../lib/intent-context-policy'
import { matchesIdentityQuestion } from '../lib/intent-patterns'

const orderAndCatalogHistory = [
  { role: 'user', content: 'Mostrami dei pantaloni neri da uomo' },
  { role: 'assistant', content: 'Ho trovato cinque prodotti verificati.' },
  { role: 'user', content: 'Dove si trova il mio ordine?' },
  { role: 'assistant', content: 'Inserisci numero ordine ed email.' },
  { role: 'user', content: 'Chi è Katia?' },
  { role: 'assistant', content: 'Non ho informazioni verificate.' },
]

for (const question of [
  'chi siete??',
  'E chi siete?',
  'Potete dirmi chi siete?',
  'cosa fate?',
  'Who are you?',
]) {
  assert.equal(matchesIdentityQuestion(question), true, `Identità non riconosciuta: ${question}`)
}

assert.equal(matchesIdentityQuestion('Chi è Katia?'), false, 'Una persona specifica non è l’identità aziendale')
assert.deepEqual(
  conversationHistoryForIntent('identity_question', orderAndCatalogHistory),
  [],
  'Una domanda identitaria esplicita deve azzerare il contesto di retrieval e generazione'
)
assert.deepEqual(
  conversationHistoryForIntent('question', orderAndCatalogHistory),
  orderAndCatalogHistory,
  'Le normali domande devono mantenere il contesto conversazionale'
)

console.log('Intent context policy tests passed')
