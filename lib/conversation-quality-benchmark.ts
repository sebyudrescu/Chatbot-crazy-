import { z } from "zod";

const normalizedText = (value: string) => value.trim().toLocaleLowerCase("it");
const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

export const conversationQualityContractSchema = z.object({
  minimumAnswerScore: z.number().min(0).max(1).default(0.75),
  expectedIntents: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
  expectedTools: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  forbiddenTools: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  minimumToolPrecision: z.number().min(0).max(1).default(0.5),
  minimumToolRecall: z.number().min(0).max(1).default(1),
  cardPolicy: z.enum(["required", "forbidden", "optional"]).default("optional"),
  relevantProductIds: z.array(z.string().trim().min(1).max(160)).max(100).default([]),
  minimumProductPrecision: z.number().min(0).max(1).default(0.8),
  minimumProductRecall: z.number().min(0).max(1).default(0.8),
  minimumProductMrr: z.number().min(0).max(1).default(0.5),
  expectedMemory: z.record(z.string().max(300)).default({}),
  minimumMemoryRetention: z.number().min(0).max(1).default(1),
});

export const conversationQualityObservationSchema = z.object({
  answerSemanticScore: z.number().min(0).max(1),
  intent: z.string().trim().max(80).nullable().default(null),
  tools: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  productIds: z.array(z.string().trim().min(1).max(160)).max(100).default([]),
  cardsShown: z.number().int().nonnegative().max(100).default(0),
  rememberedSlots: z.record(z.string().max(300)).default({}),
});

export const conversationQualityEvidenceSchema = conversationQualityObservationSchema.omit({
  answerSemanticScore: true,
});

export const conversationQualityRequestSchema = z.object({
  contract: conversationQualityContractSchema,
  observation: conversationQualityEvidenceSchema,
});

export type ConversationQualityContract = z.infer<typeof conversationQualityContractSchema>;
export type ConversationQualityObservation = z.infer<typeof conversationQualityObservationSchema>;

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

function harmonicMean(precision: number | null, recall: number | null) {
  if (precision === null || recall === null) return null;
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

export function evaluateConversationQuality(
  rawContract: z.input<typeof conversationQualityContractSchema>,
  rawObservation: z.input<typeof conversationQualityObservationSchema>,
) {
  const contract = conversationQualityContractSchema.parse(rawContract);
  const observation = conversationQualityObservationSchema.parse(rawObservation);
  const expectedTools = unique(contract.expectedTools.map(normalizedText));
  const forbiddenTools = new Set(contract.forbiddenTools.map(normalizedText));
  const observedTools = unique(observation.tools.map(normalizedText));
  const expectedToolSet = new Set(expectedTools);
  const expectedToolHits = observedTools.filter((tool) => expectedToolSet.has(tool)).length;
  const unexpectedObservedTools = observedTools.filter(
    (tool) => !expectedToolSet.has(tool) && !forbiddenTools.has(tool),
  );
  const forbiddenToolHits = observedTools.filter((tool) => forbiddenTools.has(tool));
  const toolPrecision = expectedTools.length
    ? ratio(expectedToolHits, expectedToolHits + unexpectedObservedTools.length)
    : null;
  const toolRecall = ratio(expectedToolHits, expectedTools.length);
  const toolRoutingScore = harmonicMean(toolPrecision, toolRecall);

  const relevantProducts = new Set(contract.relevantProductIds);
  const presentedProducts = unique(observation.productIds);
  const relevantPresented = presentedProducts.filter((id) => relevantProducts.has(id));
  const productPrecision = relevantProducts.size
    ? ratio(relevantPresented.length, presentedProducts.length)
    : null;
  const productRecall = relevantProducts.size
    ? ratio(relevantPresented.length, relevantProducts.size)
    : null;
  const firstRelevantRank = presentedProducts.findIndex((id) => relevantProducts.has(id));
  const productMrr = relevantProducts.size
    ? firstRelevantRank < 0 ? 0 : 1 / (firstRelevantRank + 1)
    : null;

  const memoryEntries = Object.entries(contract.expectedMemory);
  const rememberedCount = memoryEntries.filter(([key, expected]) => {
    const actual = observation.rememberedSlots[key];
    return typeof actual === "string" && normalizedText(actual) === normalizedText(expected);
  }).length;
  const memoryRetention = ratio(rememberedCount, memoryEntries.length);

  const normalizedIntent = observation.intent ? normalizedText(observation.intent) : null;
  const intentCorrect = contract.expectedIntents.length === 0
    ? null
    : Boolean(normalizedIntent && contract.expectedIntents.map(normalizedText).includes(normalizedIntent));
  const cardPolicyPassed = contract.cardPolicy === "optional"
    || (contract.cardPolicy === "required" && observation.cardsShown > 0)
    || (contract.cardPolicy === "forbidden" && observation.cardsShown === 0);

  const failures: string[] = [];
  if (observation.answerSemanticScore < contract.minimumAnswerScore) {
    failures.push(`Risposta semantica sotto soglia (${observation.answerSemanticScore.toFixed(2)})`);
  }
  if (intentCorrect === false) failures.push("Intento non coerente con lo scenario");
  if (toolPrecision !== null && toolPrecision < contract.minimumToolPrecision) failures.push("Precisione routing tool sotto soglia");
  if (toolRecall !== null && toolRecall < contract.minimumToolRecall) failures.push("Recall routing tool sotto soglia");
  if (forbiddenToolHits.length) failures.push(`Tool vietati usati: ${forbiddenToolHits.join(", ")}`);
  if (!cardPolicyPassed) failures.push(contract.cardPolicy === "required" ? "Card attese mancanti" : "Card mostrate fuori contesto");
  if (productPrecision !== null && productPrecision < contract.minimumProductPrecision) failures.push("Precisione prodotti sotto soglia");
  if (productRecall !== null && productRecall < contract.minimumProductRecall) failures.push("Recall prodotti sotto soglia");
  if (productMrr !== null && productMrr < contract.minimumProductMrr) failures.push("Ranking prodotti sotto soglia");
  if (memoryRetention !== null && memoryRetention < contract.minimumMemoryRetention) failures.push("Memoria conversazionale insufficiente");

  const applicableScores = [
    observation.answerSemanticScore,
    intentCorrect === null ? null : intentCorrect ? 1 : 0,
    toolRoutingScore,
    cardPolicyPassed ? 1 : 0,
    productPrecision,
    productRecall,
    productMrr,
    memoryRetention,
  ].filter((value): value is number => value !== null);

  return {
    passed: failures.length === 0,
    score: applicableScores.reduce((sum, value) => sum + value, 0) / Math.max(1, applicableScores.length),
    failures,
    dimensions: {
      answerSemanticScore: observation.answerSemanticScore,
      intentCorrect,
      toolPrecision,
      toolRecall,
      toolRoutingScore,
      forbiddenToolHits,
      cardPolicyPassed,
      productPrecision,
      productRecall,
      productMrr,
      memoryRetention,
    },
  };
}

type ConversationQualityResult = ReturnType<typeof evaluateConversationQuality>;

function averageApplicable(results: ConversationQualityResult[], read: (result: ConversationQualityResult) => number | null) {
  const values = results.map(read).filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function summarizeConversationQuality(results: ConversationQualityResult[]) {
  const total = results.length;
  const cardViolations = results.filter((result) => !result.dimensions.cardPolicyPassed).length;
  return {
    total,
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    passRate: total ? results.filter((result) => result.passed).length / total : 0,
    answerCorrectRate: total
      ? results.filter((result) => !result.failures.some((failure) => failure.startsWith("Risposta semantica"))).length / total
      : 0,
    cardViolationRate: total ? cardViolations / total : 0,
    toolRoutingScore: averageApplicable(results, (result) => result.dimensions.toolRoutingScore),
    productPrecision: averageApplicable(results, (result) => result.dimensions.productPrecision),
    productRecall: averageApplicable(results, (result) => result.dimensions.productRecall),
    productMrr: averageApplicable(results, (result) => result.dimensions.productMrr),
    memoryRetention: averageApplicable(results, (result) => result.dimensions.memoryRetention),
  };
}
