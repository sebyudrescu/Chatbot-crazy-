export interface EvaluationContextRelevance {
  retrievalRelevantIndexes: number[];
  authoritativeBusinessContextRelevant: boolean;
}

/**
 * The judge sees one combined context list so it can evaluate answer
 * faithfulness. Retrieval metrics, however, must only score documents that
 * were actually retrieved. The owner-configured business context is evidence,
 * but it is not a ranked retrieval candidate.
 */
export function partitionEvaluationContextRelevance(params: {
  relevantContextIndexes: number[];
  includesAuthoritativeBusinessContext: boolean;
  retrievalCandidateCount: number;
}): EvaluationContextRelevance {
  const offset = params.includesAuthoritativeBusinessContext ? 1 : 0;
  const uniqueIndexes = [...new Set(params.relevantContextIndexes.filter(Number.isInteger))];

  return {
    authoritativeBusinessContextRelevant:
      params.includesAuthoritativeBusinessContext && uniqueIndexes.includes(0),
    retrievalRelevantIndexes: uniqueIndexes
      .map((index) => index - offset)
      .filter((index) => index >= 0 && index < params.retrievalCandidateCount),
  };
}
