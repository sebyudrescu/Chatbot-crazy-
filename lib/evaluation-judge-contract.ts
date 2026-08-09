import { z } from "zod";

const normalizedScore = z.preprocess((value) => {
  const raw = typeof value === "string" ? value.trim().replace("%", "").replace(",", ".") : value;
  const number = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(number)) return value;
  return number > 1 && number <= 100 ? number / 100 : number;
}, z.number().min(0).max(1));

const normalizedBoolean = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  if (value.trim().toLocaleLowerCase("en") === "true") return true;
  if (value.trim().toLocaleLowerCase("en") === "false") return false;
  return value;
}, z.boolean());

export const evaluationJudgeSchema = z.object({
  score: normalizedScore,
  faithfulness: normalizedScore,
  answerAccuracy: normalizedScore,
  grounded: normalizedBoolean,
  relevant: normalizedBoolean,
  complete: normalizedBoolean,
  safe: normalizedBoolean,
  relevantContextIndexes: z.array(z.coerce.number().int().min(0).max(19)).max(20),
  reason: z.string().max(1000),
});

export function strictDeterministicEvaluationPass(result: {
  passed: boolean;
  score: number;
  dimensions: { faithfulness: number; answerAccuracy: number; policySafe: boolean };
}) {
  return result.passed &&
    result.score >= 0.75 &&
    result.dimensions.faithfulness >= 0.7 &&
    result.dimensions.answerAccuracy >= 0.7 &&
    result.dimensions.policySafe;
}
