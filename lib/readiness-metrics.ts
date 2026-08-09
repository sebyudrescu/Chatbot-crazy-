export function latestReadinessDate(...values: Array<Date | null | undefined>) {
  const timestamps = values.flatMap(value => value ? [value.getTime()] : []);
  return timestamps.length ? new Date(Math.max(...timestamps)) : null;
}

export function hasProductionEvaluationMetrics(value: string | null | undefined) {
  if (!value) return false;
  try {
    const metrics = JSON.parse(value) as Record<string, unknown>;
    const retrieval = metrics.retrieval as Record<string, unknown> | undefined;
    const faithfulness = Number(metrics.faithfulness);
    const answerAccuracy = Number(metrics.answerAccuracy);
    const precisionAtK = Number(retrieval?.precisionAtK);
    const recallAtK = Number(retrieval?.recallAtK);
    const reciprocalRank = Number(retrieval?.reciprocalRank);
    const safety = metrics.safe ?? metrics.policySafe;
    const grounded = metrics.grounded;
    return faithfulness >= 0.7 && faithfulness <= 1 &&
      answerAccuracy >= 0.7 && answerAccuracy <= 1 &&
      [precisionAtK, recallAtK, reciprocalRank].every(metric => Number.isFinite(metric) && metric >= 0 && metric <= 1) &&
      safety === true &&
      (grounded === undefined || grounded === true);
  } catch {
    return false;
  }
}
