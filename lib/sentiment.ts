export type ConversationSentiment = "positive" | "neutral" | "negative";

const positivePatterns = [
  /\b(grazie|perfetto|ottimo|fantastico|eccellente|gentil[ei]|brav[oa]|soddisfatt[oa]|risolto|funziona)\b/giu,
  /(?:❤️|❤|😍|😊|😁|👍|🎉)/gu,
];

const negativePatterns = [
  /\b(problema|errore|rotto|inutile|pessimo|terribile|delus[oa]|arrabbiat[oa]|rimborso|reclamo|truffa|urgente)\b/giu,
  /\b(non funziona|non va|non riesco|non capisco|nessuna risposta|mai ricevuto)\b/giu,
  /(?:😡|🤬|😞|😢|👎)/gu,
];

function score(text: string, patterns: RegExp[]) {
  return patterns.reduce((total, pattern) => {
    pattern.lastIndex = 0;
    return total + Array.from(text.matchAll(pattern)).length;
  }, 0);
}

export function detectSentiment(message: string): ConversationSentiment {
  const normalized = message.normalize("NFKC").toLocaleLowerCase("it");
  const positive = score(normalized, positivePatterns);
  const negative = score(normalized, negativePatterns);
  if (negative > positive) return "negative";
  if (positive > negative) return "positive";
  return "neutral";
}
