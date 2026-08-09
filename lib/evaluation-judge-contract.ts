import { z } from "zod";

const normalizedScore = z.preprocess((value) => {
  const raw = typeof value === "string" ? value.trim().replace(",", ".") : value;
  const numericText = typeof raw === "string"
    ? raw.match(/[-+]?\d+(?:\.\d+)?/)?.[0]
    : raw;
  if (typeof raw === "string" && numericText === undefined) {
    const label = raw.toLocaleLowerCase("it");
    if (/\b(eccellente|excellent|molto alta|very high)\b/.test(label)) return 0.95;
    if (/\b(alta|alto|high|buona|buono|good)\b/.test(label)) return 0.85;
    if (/\b(media|medio|medium|moderata|moderato|moderate)\b/.test(label)) return 0.6;
    if (/\b(bassa|basso|low|scarsa|scarso|poor)\b/.test(label)) return 0.3;
    if (/\b(nessuna|nessuno|none|zero)\b/.test(label)) return 0;
  }
  const number = typeof numericText === "number" ? numericText : Number(numericText);
  if (!Number.isFinite(number)) return value;
  return (typeof raw === "string" && raw.includes("%")) || (number > 1 && number <= 100)
    ? number / 100
    : number;
}, z.number().min(0).max(1));

const normalizedBoolean = z.preprocess((value) => {
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : value;
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLocaleLowerCase("it");
  if (/\b(false|no|non|not|falso|irrilevante|irrelevant|incomplet[oa]|incomplete|insicur[oa]|unsafe|0)\b/.test(normalized)) return false;
  if (/\b(true|yes|s[iì]|vero|rilevante|relevant|supportat[oa]|grounded|complet[oa]|complete|sicur[oa]|safe|1)\b/.test(normalized)) return true;
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
  relevantContextIndexes: z.array(z.coerce.number().int().min(0).max(99)).max(20),
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
