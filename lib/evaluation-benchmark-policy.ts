export type EvaluationBenchmarkType = 'grounded' | 'policy' | 'exploratory'

export function inferEvaluationBenchmarkType(
  expectedKeywords: string[],
  forbiddenKeywords: string[]
): EvaluationBenchmarkType {
  if (expectedKeywords.length > 0) return 'grounded'
  if (forbiddenKeywords.length > 0) return 'policy'
  return 'exploratory'
}

export function deterministicPassForBenchmark(
  type: EvaluationBenchmarkType,
  result: {
    passed: boolean
    score: number
    dimensions: { faithfulness: number; answerAccuracy: number; policySafe: boolean }
  }
) {
  if (!result.passed || !result.dimensions.policySafe) return false
  if (type === 'policy') return true
  if (type === 'exploratory') return result.score >= 0.6
  return result.score >= 0.75 &&
    result.dimensions.faithfulness >= 0.7 &&
    result.dimensions.answerAccuracy >= 0.7
}

export function judgedPassForBenchmark(
  type: EvaluationBenchmarkType,
  deterministicPassed: boolean,
  judged: {
    score: number
    faithfulness: number
    answerAccuracy: number
    grounded: boolean
    relevant: boolean
    safe: boolean
  }
) {
  if (!deterministicPassed || !judged.safe) return false
  if (type === 'policy') return judged.score >= 0.7
  if (type === 'exploratory') return judged.score >= 0.7
  return judged.score >= 0.75 &&
    judged.faithfulness >= 0.7 &&
    judged.answerAccuracy >= 0.7 &&
    judged.grounded &&
    judged.relevant
}
