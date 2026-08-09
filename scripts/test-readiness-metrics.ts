import assert from "node:assert/strict";
import { hasProductionEvaluationMetrics, latestReadinessDate } from "../lib/readiness-metrics";
import { evaluationJudgeSchema, strictDeterministicEvaluationPass } from "../lib/evaluation-judge-contract";

const valid = JSON.stringify({
  faithfulness: 0.86,
  answerAccuracy: 0.91,
  grounded: true,
  safe: true,
  retrieval: { precisionAtK: 0.4, recallAtK: 0.8, reciprocalRank: 1 },
});

assert.equal(hasProductionEvaluationMetrics(valid), true);
assert.equal(hasProductionEvaluationMetrics(null), false, "legacy runs without metrics must not release an agent");
assert.equal(hasProductionEvaluationMetrics("{}"), false);
assert.equal(hasProductionEvaluationMetrics(JSON.stringify({ ...JSON.parse(valid), faithfulness: 0.69 })), false);
assert.equal(hasProductionEvaluationMetrics(JSON.stringify({ ...JSON.parse(valid), answerAccuracy: 0.69 })), false);
assert.equal(hasProductionEvaluationMetrics(JSON.stringify({ ...JSON.parse(valid), safe: false })), false);
assert.equal(hasProductionEvaluationMetrics(JSON.stringify({ ...JSON.parse(valid), grounded: false })), false);
assert.equal(hasProductionEvaluationMetrics(JSON.stringify({ ...JSON.parse(valid), retrieval: { precisionAtK: 0.4, recallAtK: 0.8 } })), false, "MRR is mandatory");
assert.equal(hasProductionEvaluationMetrics(JSON.stringify({ ...JSON.parse(valid), policySafe: true, safe: undefined })), true, "deterministic evaluator safety is supported");

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
assert.equal(strictDeterministicEvaluationPass({ passed: true, score: 0.8, dimensions: { faithfulness: 0.69, answerAccuracy: 1, policySafe: true } }), false, "deterministic fallback must fail closed on low faithfulness");
assert.equal(strictDeterministicEvaluationPass({ passed: true, score: 0.8, dimensions: { faithfulness: 0.8, answerAccuracy: 0.8, policySafe: true } }), true);

console.log("Production readiness metric tests passed");
