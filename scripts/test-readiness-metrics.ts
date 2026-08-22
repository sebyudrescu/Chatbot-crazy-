import assert from "node:assert/strict";
import { hasProductionConversationQualityMetrics, hasProductionEvaluationMetrics, latestReadinessDate, productionEvaluationMetricType } from "../lib/readiness-metrics";
import { evaluationJudgeSchema, strictDeterministicEvaluationPass } from "../lib/evaluation-judge-contract";
import { deterministicPassForBenchmark, inferEvaluationBenchmarkType, judgedPassForBenchmark } from "../lib/evaluation-benchmark-policy";

const valid = JSON.stringify({
  benchmarkType: "grounded",
  faithfulness: 0.86,
  answerAccuracy: 0.91,
  grounded: true,
  safe: true,
  retrieval: { applicable: true, precisionAtK: 0.4, recallAtK: 0.8, reciprocalRank: 1 },
});

assert.equal(hasProductionEvaluationMetrics(valid), true);
assert.equal(hasProductionEvaluationMetrics(null), false, "legacy runs without metrics must not release an agent");
assert.equal(hasProductionEvaluationMetrics("{}"), false);
assert.equal(hasProductionEvaluationMetrics(JSON.stringify({ ...JSON.parse(valid), faithfulness: 0.69 })), false);
const authoritativeContext = JSON.stringify({ ...JSON.parse(valid), retrieval: { ...JSON.parse(valid).retrieval, applicable: false } });
assert.equal(productionEvaluationMetricType(authoritativeContext), 'context', "authoritative context must be valid but separate from retrieval");
assert.equal(hasProductionEvaluationMetrics(authoritativeContext), true);
assert.equal(hasProductionEvaluationMetrics(JSON.stringify({ ...JSON.parse(valid), answerAccuracy: 0.69 })), false);
assert.equal(hasProductionEvaluationMetrics(JSON.stringify({ ...JSON.parse(valid), safe: false })), false);
assert.equal(hasProductionEvaluationMetrics(JSON.stringify({ ...JSON.parse(valid), grounded: false })), false);
assert.equal(hasProductionEvaluationMetrics(JSON.stringify({ ...JSON.parse(valid), retrieval: { precisionAtK: 0.4, recallAtK: 0.8 } })), false, "MRR is mandatory");
assert.equal(hasProductionEvaluationMetrics(JSON.stringify({ ...JSON.parse(valid), policySafe: true, safe: undefined })), true, "deterministic evaluator safety is supported");

const validConversationQuality = JSON.stringify({
  conversationQuality: {
    passed: true,
    score: 0.95,
    dimensions: {
      answerSemanticScore: 0.92,
      intentCorrect: true,
      toolPrecision: 1,
      toolRecall: 1,
      forbiddenToolHits: [],
      cardPolicyPassed: true,
      productPrecision: 1,
      productRecall: 1,
      productMrr: 1,
      memoryRetention: 1,
    },
  },
});
assert.equal(hasProductionConversationQualityMetrics(validConversationQuality), true);
assert.equal(hasProductionConversationQualityMetrics(null), false);
assert.equal(hasProductionConversationQualityMetrics(JSON.stringify({ ...JSON.parse(validConversationQuality), conversationQuality: { ...JSON.parse(validConversationQuality).conversationQuality, passed: false } })), false);
assert.equal(hasProductionConversationQualityMetrics(JSON.stringify({ conversationQuality: { ...JSON.parse(validConversationQuality).conversationQuality, dimensions: { ...JSON.parse(validConversationQuality).conversationQuality.dimensions, cardPolicyPassed: false } } })), false);
assert.equal(hasProductionConversationQualityMetrics(JSON.stringify({ conversationQuality: { ...JSON.parse(validConversationQuality).conversationQuality, dimensions: { ...JSON.parse(validConversationQuality).conversationQuality.dimensions, memoryRetention: 0.8 } } })), false);

const descriptiveLabelJudge = evaluationJudgeSchema.parse({
  score: "92% (eccellente)",
  faithfulness: "Alta: tutte le affermazioni sono supportate",
  answerAccuracy: "good",
  grounded: "true - presente nei contesti",
  relevant: "The response is relevant to the question",
  complete: 1,
  safe: "vero",
  relevantContextIndexes: [0],
  reason: "Risposta supportata.",
});
assert.equal(descriptiveLabelJudge.score, 0.92);
assert.equal(descriptiveLabelJudge.faithfulness, 0.85);
assert.equal(descriptiveLabelJudge.answerAccuracy, 0.85);
assert.equal(descriptiveLabelJudge.grounded, true);
assert.equal(descriptiveLabelJudge.relevant, true);
assert.equal(descriptiveLabelJudge.complete, true);
assert.equal(descriptiveLabelJudge.safe, true);
const validPolicy = JSON.stringify({ benchmarkType: "policy", answerAccuracy: 1, policySafe: true, faithfulness: 0 });
assert.equal(hasProductionEvaluationMetrics(validPolicy), true, "policy cases do not require irrelevant RAG grounding");
assert.equal(productionEvaluationMetricType(validPolicy), "policy");
assert.equal(hasProductionEvaluationMetrics(JSON.stringify({ ...JSON.parse(validPolicy), policySafe: false })), false);
assert.equal(hasProductionEvaluationMetrics(JSON.stringify({ ...JSON.parse(valid), benchmarkType: "exploratory" })), false, "exploratory cases cannot release an agent");
assert.equal(hasProductionEvaluationMetrics(JSON.stringify({ ...JSON.parse(valid), benchmarkType: undefined })), false, "legacy untyped metrics cannot release an agent");

const promptChangedAt = new Date("2026-08-01T10:00:00.000Z");
const knowledgeChangedAt = new Date("2026-08-02T10:00:00.000Z");
assert.equal(latestReadinessDate(promptChangedAt, knowledgeChangedAt)?.toISOString(), knowledgeChangedAt.toISOString());
assert.equal(latestReadinessDate(null, undefined), null);

const normalizedJudge = evaluationJudgeSchema.parse({
  score: 92,
  faithfulness: "86%",
  answerAccuracy: "0.91",
  grounded: "true",
  relevant: true,
  complete: true,
  safe: "true",
  relevantContextIndexes: ["0", 2],
  reason: "Risposta verificata",
});
assert.equal(normalizedJudge.score, 0.92);
assert.equal(normalizedJudge.faithfulness, 0.86);
assert.equal(normalizedJudge.answerAccuracy, 0.91);
assert.deepEqual(normalizedJudge.relevantContextIndexes, [0, 2]);
const descriptiveJudge = evaluationJudgeSchema.parse({
  score: "92% (eccellente)",
  faithfulness: "0.86 (alta)",
  answerAccuracy: "91 su 100",
  grounded: true,
  relevant: true,
  complete: true,
  safe: true,
  relevantContextIndexes: [0],
  reason: "Valori descrittivi normalizzati",
});
assert.equal(descriptiveJudge.score, 0.92);
assert.equal(descriptiveJudge.faithfulness, 0.86);
assert.equal(descriptiveJudge.answerAccuracy, 0.91);
assert.equal(strictDeterministicEvaluationPass({ passed: true, score: 0.8, dimensions: { faithfulness: 0.69, answerAccuracy: 1, policySafe: true } }), false, "deterministic fallback must fail closed on low faithfulness");
assert.equal(strictDeterministicEvaluationPass({ passed: true, score: 0.8, dimensions: { faithfulness: 0.8, answerAccuracy: 0.8, policySafe: true } }), true);

assert.equal(inferEvaluationBenchmarkType(["verona"], []), "grounded");
assert.equal(inferEvaluationBenchmarkType([], ["system prompt"]), "policy");
assert.equal(inferEvaluationBenchmarkType([], []), "exploratory");
const policyDeterministic = { passed: true, score: 0.5, dimensions: { faithfulness: 0.02, answerAccuracy: 1, policySafe: true } };
assert.equal(deterministicPassForBenchmark("policy", policyDeterministic), true, "policy tests must not fail for low faithfulness");
assert.equal(deterministicPassForBenchmark("grounded", policyDeterministic), false, "grounded tests retain the strict RAG gate");
assert.equal(judgedPassForBenchmark("policy", true, { score: 0.8, faithfulness: 0, answerAccuracy: 1, grounded: false, relevant: false, safe: true }), true);
assert.equal(judgedPassForBenchmark("grounded", true, { score: 0.8, faithfulness: 0, answerAccuracy: 1, grounded: false, relevant: false, safe: true }), false);

console.log("Production readiness metric tests passed");
