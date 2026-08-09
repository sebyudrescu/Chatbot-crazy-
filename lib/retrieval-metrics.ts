export interface RetrievalMetricSample {
  retrievedIds: string[];
  relevantIds: string[];
}

export interface RetrievalMetrics {
  precisionAtK: number;
  recallAtK: number;
  reciprocalRank: number;
  ndcgAtK: number;
}

export interface AnswerQualityMetrics {
  faithfulness: number;
  answerAccuracy: number;
}

const STOP_WORDS = new Set([
  "alla", "alle", "anche", "avere", "che", "con", "come", "dalla", "delle", "dello",
  "dove", "essere", "gli", "hai", "hanno", "non", "nella", "nelle", "per", "piu", "puo",
  "sono", "sua", "suo", "tra", "una", "uno", "your", "with", "from", "that", "this", "the",
]);

function meaningfulTokens(value: string) {
  return (value.normalize("NFKC").toLocaleLowerCase("it").match(/[\p{L}\p{N}]+/gu) || [])
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function tokenCoverage(candidate: string, evidenceTokens: Set<string>) {
  const tokens = [...new Set(meaningfulTokens(candidate))];
  return tokens.length ? tokens.filter((token) => evidenceTokens.has(token)).length / tokens.length : 1;
}

export function calculateFaithfulness(response: string, contexts: string[]): number {
  const clean = response.trim();
  if (!clean) return 0;
  if (!contexts.length) return /non (ho|abbiamo) (abbastanza )?informazioni|non posso verificar/i.test(clean) ? 1 : 0;
  const evidenceTokens = new Set(meaningfulTokens(contexts.join(" ")));
  const claims = clean.split(/(?<=[.!?])\s+|\n+/).map((claim) => claim.trim()).filter((claim) => claim.length >= 12);
  if (!claims.length) return tokenCoverage(clean, evidenceTokens);
  const scores = claims.map((claim) => tokenCoverage(claim, evidenceTokens));
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

export function calculateAnswerAccuracy(
  response: string,
  expectedKeywords: string[],
  forbiddenKeywords: string[] = [],
): number {
  const normalized = response.normalize("NFKC").toLocaleLowerCase("it");
  const expectedCoverage = expectedKeywords.length
    ? expectedKeywords.filter((keyword) => normalized.includes(keyword.normalize("NFKC").toLocaleLowerCase("it"))).length / expectedKeywords.length
    : (response.trim() ? 1 : 0);
  const forbiddenFound = forbiddenKeywords.filter((keyword) => normalized.includes(keyword.normalize("NFKC").toLocaleLowerCase("it"))).length;
  return Math.max(0, expectedCoverage - (forbiddenFound ? Math.min(1, forbiddenFound / Math.max(1, forbiddenKeywords.length)) : 0));
}

export function calculateAnswerQualityMetrics(
  response: string,
  contexts: string[],
  expectedKeywords: string[],
  forbiddenKeywords: string[] = [],
): AnswerQualityMetrics {
  return {
    faithfulness: calculateFaithfulness(response, contexts),
    answerAccuracy: calculateAnswerAccuracy(response, expectedKeywords, forbiddenKeywords),
  };
}

export function calibrateRagThresholds(samples: Array<{
  confidence: number;
  retrievalScore: number;
  passed: boolean;
}>): { retrievalMinScore: number; groundingThreshold: number; sampleCount: number } {
  if (!samples.length) return { retrievalMinScore: 0.3, groundingThreshold: 0.7, sampleCount: 0 };
  const candidates = Array.from({ length: 81 }, (_, index) => 0.1 + index * 0.01);
  const optimize = (field: "confidence" | "retrievalScore", fallback: number) => {
    let best = { threshold: fallback, utility: -Infinity };
    for (const threshold of candidates) {
      let truePositive = 0, trueNegative = 0, falsePositive = 0, falseNegative = 0;
      for (const sample of samples) {
        const accepted = sample[field] >= threshold;
        if (accepted && sample.passed) truePositive++;
        else if (!accepted && !sample.passed) trueNegative++;
        else if (accepted) falsePositive++;
        else falseNegative++;
      }
      const utility = truePositive * 1.5 + trueNegative - falsePositive * 3 - falseNegative;
      if (utility > best.utility || (utility === best.utility && Math.abs(threshold - fallback) < Math.abs(best.threshold - fallback))) {
        best = { threshold, utility };
      }
    }
    return Math.round(best.threshold * 100) / 100;
  };
  return {
    retrievalMinScore: optimize("retrievalScore", 0.3),
    groundingThreshold: optimize("confidence", 0.7),
    sampleCount: samples.length,
  };
}

const safeDivide = (numerator: number, denominator: number) => denominator ? numerator / denominator : 0;

export function calculateRetrievalMetrics(
  sample: RetrievalMetricSample,
  k = sample.retrievedIds.length,
): RetrievalMetrics {
  const retrieved = sample.retrievedIds.slice(0, Math.max(0, k));
  const relevant = new Set(sample.relevantIds);
  const relevantRetrieved = retrieved.filter((id) => relevant.has(id));
  const firstRelevantRank = retrieved.findIndex((id) => relevant.has(id));
  const discountedGain = retrieved.reduce(
    (sum, id, index) => sum + (relevant.has(id) ? 1 / Math.log2(index + 2) : 0),
    0,
  );
  const effectiveK = Math.max(0, k);
  const idealCount = Math.min(relevant.size, effectiveK);
  const idealDiscountedGain = Array.from({ length: idealCount }, (_, index) => 1 / Math.log2(index + 2))
    .reduce((sum, value) => sum + value, 0);

  return {
    precisionAtK: safeDivide(relevantRetrieved.length, effectiveK),
    recallAtK: safeDivide(relevantRetrieved.length, relevant.size),
    reciprocalRank: firstRelevantRank >= 0 ? 1 / (firstRelevantRank + 1) : 0,
    ndcgAtK: safeDivide(discountedGain, idealDiscountedGain),
  };
}

export function averageRetrievalMetrics(samples: RetrievalMetrics[]): RetrievalMetrics {
  if (!samples.length) return { precisionAtK: 0, recallAtK: 0, reciprocalRank: 0, ndcgAtK: 0 };
  return samples.reduce<RetrievalMetrics>((average, sample) => ({
    precisionAtK: average.precisionAtK + sample.precisionAtK / samples.length,
    recallAtK: average.recallAtK + sample.recallAtK / samples.length,
    reciprocalRank: average.reciprocalRank + sample.reciprocalRank / samples.length,
    ndcgAtK: average.ndcgAtK + sample.ndcgAtK / samples.length,
  }), { precisionAtK: 0, recallAtK: 0, reciprocalRank: 0, ndcgAtK: 0 });
}
