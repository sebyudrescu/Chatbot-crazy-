export interface EvaluationCriteria {
  expectedKeywords: string[];
  forbiddenKeywords: string[];
  minimumConfidence: number;
}

export function evaluateResponse(
  response: string,
  confidence: number | null | undefined,
  criteria: EvaluationCriteria,
) {
  const clean = response.trim();
  const normalized = clean.toLocaleLowerCase("it");
  const missing = criteria.expectedKeywords.filter(
    (keyword) => !normalized.includes(keyword.toLocaleLowerCase("it")),
  );
  const forbidden = criteria.forbiddenKeywords.filter(
    (keyword) => normalized.includes(keyword.toLocaleLowerCase("it")),
  );
  const failures: string[] = [];
  if (!clean) failures.push("Risposta vuota");
  if (missing.length) failures.push(`Parole attese mancanti: ${missing.join(", ")}`);
  if (forbidden.length) failures.push(`Contenuti vietati trovati: ${forbidden.join(", ")}`);
  if (confidence != null && confidence < criteria.minimumConfidence) {
    failures.push(
      `Confidenza ${Math.round(confidence * 100)}% sotto la soglia ${Math.round(criteria.minimumConfidence * 100)}%`,
    );
  }
  const expectedCoverage = criteria.expectedKeywords.length
    ? (criteria.expectedKeywords.length - missing.length) / criteria.expectedKeywords.length
    : 1;
  const confidenceScore = confidence == null ? 0.5 : confidence;
  const completeness = clean.length >= 40 ? 1 : clean.length / 40;
  const score = Math.max(
    0,
    Math.min(
      1,
      expectedCoverage * 0.5
        + confidenceScore * 0.3
        + completeness * 0.2
        - (forbidden.length ? 0.5 : 0),
    ),
  );
  return {
    passed: failures.length === 0,
    failureReason: failures.join(" · ") || null,
    score,
    dimensions: {
      expectedCoverage,
      confidence: confidenceScore,
      completeness,
      policySafe: forbidden.length === 0,
    },
  };
}

export function parseKeywords(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}
