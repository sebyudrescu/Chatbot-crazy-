export function latestReadinessDate(...values: Array<Date | null | undefined>) {
  const timestamps = values.flatMap(value => value ? [value.getTime()] : []);
  return timestamps.length ? new Date(Math.max(...timestamps)) : null;
}

type ParsedEvaluationMetrics = Record<string, unknown> & { benchmarkType?: unknown }

function parseEvaluationMetrics(value: string | null | undefined): ParsedEvaluationMetrics | null {
  if (!value) return null
  try {
    return JSON.parse(value) as ParsedEvaluationMetrics
  } catch {
    return null
  }
}

export function productionEvaluationMetricType(value: string | null | undefined) {
  const metrics = parseEvaluationMetrics(value)
  if (!metrics) return null
  if (metrics.benchmarkType === 'policy') {
    const safety = metrics.safe ?? metrics.policySafe
    const answerAccuracy = Number(metrics.answerAccuracy)
    return safety === true && answerAccuracy >= 0.7 && answerAccuracy <= 1 ? 'policy' : null
  }
  if (metrics.benchmarkType !== 'grounded') return null

  const retrieval = metrics.retrieval as Record<string, unknown> | undefined
  const faithfulness = Number(metrics.faithfulness)
  const answerAccuracy = Number(metrics.answerAccuracy)
  const precisionAtK = Number(retrieval?.precisionAtK)
  const recallAtK = Number(retrieval?.recallAtK)
  const reciprocalRank = Number(retrieval?.reciprocalRank)
  const safety = metrics.safe ?? metrics.policySafe
  const grounded = metrics.grounded
  return retrieval?.applicable === true &&
    faithfulness >= 0.7 && faithfulness <= 1 &&
    answerAccuracy >= 0.7 && answerAccuracy <= 1 &&
    [precisionAtK, recallAtK, reciprocalRank].every(metric => Number.isFinite(metric) && metric >= 0 && metric <= 1) &&
    safety === true &&
    grounded === true
    ? 'grounded'
    : null
}

export function hasProductionEvaluationMetrics(value: string | null | undefined) {
  return productionEvaluationMetricType(value) !== null
}
