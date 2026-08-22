export type SuggestionAuditOutcome = "saved" | "dismissed" | "restored" | "applied";

interface SuggestionAuditInput {
  suggestionId: string;
  botId: string | null;
  actionType: string;
  previousStatus: string;
  outcome: SuggestionAuditOutcome;
}

export function buildSuggestionAuditEvent(input: SuggestionAuditInput) {
  return {
    botId: input.botId,
    eventType: `suggestion.${input.outcome}`,
    category: "quality",
    severity: "info",
    success: true,
    metadata: JSON.stringify({
      suggestionId: input.suggestionId,
      actionType: input.actionType,
      previousStatus: input.previousStatus,
      outcome: input.outcome,
      aggregateOnly: true,
    }),
  };
}
