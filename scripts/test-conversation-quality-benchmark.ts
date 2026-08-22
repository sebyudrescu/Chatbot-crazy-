import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  conversationQualityRequestSchema,
  evaluateConversationQuality,
  summarizeConversationQuality,
} from "../lib/conversation-quality-benchmark";
import { buildConversationQualityObservation } from "../lib/evaluation-observation";
import { assessCommerceEvaluationCoverage } from "../lib/commerce-readiness-coverage";

const productDiscovery = evaluateConversationQuality({
  minimumAnswerScore: 0.75,
  expectedIntents: ["product_discovery"],
  expectedTools: ["search_products"],
  forbiddenTools: ["search_knowledge_base"],
  cardPolicy: "required",
  relevantProductIds: ["tshirt-woman", "tshirt-unisex"],
  minimumProductPrecision: 0.66,
  minimumProductRecall: 1,
  minimumProductMrr: 1,
  expectedMemory: { audience: "donna", category: "t-shirt" },
  minimumMemoryRetention: 1,
}, {
  answerSemanticScore: 0.92,
  intent: "product_discovery",
  tools: ["search_products"],
  productIds: ["tshirt-woman", "tshirt-unisex", "tshirt-alternative"],
  cardsShown: 3,
  rememberedSlots: { audience: "Donna", category: "T-Shirt" },
});

assert.equal(productDiscovery.passed, true);
assert.equal(productDiscovery.dimensions.productPrecision, 2 / 3);
assert.equal(productDiscovery.dimensions.productRecall, 1);
assert.equal(productDiscovery.dimensions.productMrr, 1);
assert.equal(productDiscovery.dimensions.memoryRetention, 1);

const inventoryFollowUp = evaluateConversationQuality({
  minimumAnswerScore: 0.8,
  expectedIntents: ["product_detail", "inventory"],
  expectedTools: ["get_product", "check_inventory"],
  forbiddenTools: ["search_knowledge_base"],
  cardPolicy: "forbidden",
  relevantProductIds: [],
  minimumProductPrecision: 0.8,
  minimumProductRecall: 0.8,
  minimumProductMrr: 0.5,
  expectedMemory: { audience: "donna", product: "t-shirt suddenly woman" },
  minimumMemoryRetention: 1,
}, {
  answerSemanticScore: 0.94,
  intent: "inventory",
  tools: ["get_product", "check_inventory"],
  productIds: [],
  cardsShown: 0,
  rememberedSlots: { audience: "donna", product: "T-Shirt Suddenly Woman" },
});

assert.equal(inventoryFollowUp.passed, true);
assert.equal(inventoryFollowUp.dimensions.cardPolicyPassed, true);

const unrelatedPolicyTurn = evaluateConversationQuality({
  minimumAnswerScore: 0.75,
  expectedIntents: ["shipping_policy"],
  expectedTools: ["search_knowledge_base"],
  forbiddenTools: ["search_products"],
  cardPolicy: "forbidden",
  relevantProductIds: [],
  minimumProductPrecision: 0.8,
  minimumProductRecall: 0.8,
  minimumProductMrr: 0.5,
  expectedMemory: {},
  minimumMemoryRetention: 1,
}, {
  answerSemanticScore: 0.9,
  intent: "shipping_policy",
  tools: ["search_knowledge_base"],
  productIds: [],
  cardsShown: 0,
  rememberedSlots: {},
});

assert.equal(unrelatedPolicyTurn.passed, true);

const brokenTurn = evaluateConversationQuality({
  minimumAnswerScore: 0.8,
  expectedIntents: ["product_discovery"],
  expectedTools: ["search_products"],
  forbiddenTools: ["search_knowledge_base"],
  cardPolicy: "required",
  relevantProductIds: ["shirt-woman"],
  minimumProductPrecision: 1,
  minimumProductRecall: 1,
  minimumProductMrr: 1,
  expectedMemory: { audience: "donna", category: "camicia" },
  minimumMemoryRetention: 1,
}, {
  answerSemanticScore: 0.42,
  intent: "product_discovery",
  tools: ["search_knowledge_base"],
  productIds: ["blazer-man", "shirt-woman"],
  cardsShown: 2,
  rememberedSlots: { audience: "uomo", category: "giacca" },
});

assert.equal(brokenTurn.passed, false);
assert.equal(brokenTurn.dimensions.productPrecision, 0.5);
assert.equal(brokenTurn.dimensions.productMrr, 0.5);
assert.equal(brokenTurn.dimensions.memoryRetention, 0);
assert.deepEqual(brokenTurn.dimensions.forbiddenToolHits, ["search_knowledge_base"]);
assert.ok(brokenTurn.failures.length >= 6);

const noFalsePositiveCard = evaluateConversationQuality({
  minimumAnswerScore: 0.7,
  expectedIntents: [],
  expectedTools: [],
  forbiddenTools: [],
  cardPolicy: "forbidden",
  relevantProductIds: [],
  minimumProductPrecision: 0.8,
  minimumProductRecall: 0.8,
  minimumProductMrr: 0.5,
  expectedMemory: {},
  minimumMemoryRetention: 1,
}, {
  answerSemanticScore: 0.85,
  intent: "company_identity",
  tools: [],
  productIds: [],
  cardsShown: 1,
  rememberedSlots: {},
});

assert.equal(noFalsePositiveCard.passed, false);
assert.match(noFalsePositiveCard.failures.join(" "), /fuori contesto/);

assert.equal(conversationQualityRequestSchema.safeParse({
  contract: {
    cardPolicy: "forbidden",
  },
  observation: {
    cardsShown: 0,
  },
}).success, true);

assert.equal(conversationQualityRequestSchema.safeParse({
  contract: { cardPolicy: "required" },
  observation: { cardsShown: -1 },
}).success, false);

const summary = summarizeConversationQuality([
  productDiscovery,
  inventoryFollowUp,
  unrelatedPolicyTurn,
  brokenTurn,
  noFalsePositiveCard,
]);
assert.equal(summary.total, 5);
assert.equal(summary.passed, 3);
assert.equal(summary.failed, 2);
assert.equal(summary.passRate, 0.6);
assert.equal(summary.cardViolationRate, 0.2);
assert.equal(summary.productMrr, 0.75);
assert.equal(summary.memoryRetention, 2 / 3);

assert.deepEqual(buildConversationQualityObservation({
  intent: { type: "inventory" },
  decision: { sources: ["legacy_source"] },
  evaluationTrace: {
    tools: [
      { name: "get_product", success: true },
      { name: "check_inventory", success: true },
      { name: "search_knowledge_base", success: false },
    ],
    rememberedSlots: { gender: "women", category: "shirt" },
  },
  productCards: [{ productId: "shirt-woman" }],
}), {
  intent: "inventory",
  tools: ["get_product", "check_inventory"],
  productIds: ["shirt-woman"],
  cardsShown: 1,
  rememberedSlots: { gender: "women", category: "shirt" },
});

const schemaSource = readFileSync("prisma/schema.prisma", "utf8");
const migrationSource = readFileSync("prisma/migrations/20260822123000_add_conversation_quality_contract/migration.sql", "utf8");
const evaluationsApiSource = readFileSync("app/api/evaluations/route.ts", "utf8");
const evaluationsPageSource = readFileSync("app/evaluations/page.tsx", "utf8");
const runtimeSource = readFileSync("lib/agentic-chat-runtime.ts", "utf8");

assert.match(schemaSource, /conversationTurns\s+String\s+@default\("\[\]"\)/);
assert.match(schemaSource, /qualityContract\s+String\?/);
assert.match(migrationSource, /ADD COLUMN "conversationTurns" TEXT NOT NULL DEFAULT '\[\]'/);
assert.match(evaluationsApiSource, /conversationQualityContractSchema\.nullable\(\)/);
assert.match(evaluationsPageSource, /\[\.\.\.item\.conversationTurns, item\.question\]/);
assert.match(evaluationsPageSource, /conversationQuality: qualityRequest\(item, result\.data\)/);
assert.match(runtimeSource, /evaluationTrace: evaluationTrace\(agentResult\)/);

const qualityMetrics = JSON.stringify({
  conversationQuality: {
    passed: true,
    dimensions: {
      answerSemanticScore: 0.95,
      forbiddenToolHits: [],
      cardPolicyPassed: true,
      toolPrecision: 1,
      toolRecall: 1,
      productPrecision: null,
      productRecall: null,
      productMrr: null,
      memoryRetention: 1,
    },
  },
});
const run = { passed: true, createdAt: new Date("2026-08-22T12:00:00Z"), metrics: qualityMetrics };
const discoveryCoverage = {
  conversationTurns: '["Cerco qualcosa per casa"]',
  qualityContract: JSON.stringify({
    expectedTools: ["search_products"],
    cardPolicy: "required",
    expectedMemory: { category: "lamp" },
  }),
  latestRun: run,
};
const followUpCoverage = {
  conversationTurns: '["Mostrami le lampade nere"]',
  qualityContract: JSON.stringify({
    expectedTools: ["get_product", "check_inventory"],
    cardPolicy: "forbidden",
    expectedMemory: { product: "lamp-nero" },
  }),
  latestRun: run,
};
const knowledgeCoverage = {
  conversationTurns: '["Mostrami le lampade nere"]',
  qualityContract: JSON.stringify({
    expectedTools: ["search_knowledge_base"],
    forbiddenTools: ["search_products"],
    cardPolicy: "forbidden",
  }),
  latestRun: run,
};

assert.deepEqual(assessCommerceEvaluationCoverage([discoveryCoverage], null), {
  complete: false,
  covered: { discovery: true, product_follow_up: false, knowledge_boundary: false },
  missing: ["product_follow_up", "knowledge_boundary"],
});
assert.equal(assessCommerceEvaluationCoverage([discoveryCoverage, followUpCoverage, knowledgeCoverage], null).complete, true);
assert.equal(assessCommerceEvaluationCoverage([
  discoveryCoverage,
  { ...followUpCoverage, latestRun: { ...run, createdAt: new Date("2026-08-21T12:00:00Z") } },
  knowledgeCoverage,
], new Date("2026-08-22T00:00:00Z")).complete, false);
assert.equal(assessCommerceEvaluationCoverage([
  discoveryCoverage,
  { ...followUpCoverage, conversationTurns: "[]" },
  knowledgeCoverage,
], null).complete, false);

console.log("Conversation quality benchmark: 5 scenari e-commerce e copertura readiness superati");
