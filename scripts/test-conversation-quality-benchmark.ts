import assert from "node:assert/strict";
import {
  conversationQualityRequestSchema,
  evaluateConversationQuality,
  summarizeConversationQuality,
} from "../lib/conversation-quality-benchmark";

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

console.log("Conversation quality benchmark: 5 scenari e-commerce superati");
