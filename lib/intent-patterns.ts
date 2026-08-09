export function matchesIdentityQuestion(message: string): boolean {
  const normalized = message.trim().toLowerCase()
  const identityPatterns = [
    /^(?:(?:e|ma)\s+)?chi\s+(?:siete|sei|siamo)\b/i,
    /^(?:(?:e|ma)\s+)?cosa\s+(?:fate|fa|fanno|offrite|offre)\b/i,
    /^(?:(?:e|ma)\s+)?di\s+cosa\s+(?:vi\s+occupate|si\s+occupa|ti\s+occupi)\b/i,
    /^(?:puoi|potete)\s+(?:dirmi|spiegarmi)\s+(?:chi\s+(?:siete|sei)|cosa\s+(?:fate|offrite))\b/i,
    /^(?:che|quali)\s+(?:servizi|prodotti)\s*(?:offrite|avete|vendete)?\b/i,
    /^(?:parlami\s+di\s+(?:voi|te|lei|loro)|presentati|presentatevi|dimmi\s+chi\s+siete)\b/i,
    /\b(?:mission|vision|valori|filosofia)\b.*\b(?:azienda|company|vostra|tua)\b/i,
    /\b(?:vostra|tua|sua)\s+(?:storia|attività|azienda|company)\b/i,
    /^(?:who\s+are\s+you|what\s+does\s+(?:your\s+company|the\s+company)\s+do)\b/i,
  ]

  return identityPatterns.some((pattern) => pattern.test(normalized))
}
