import assert from "node:assert/strict";
import {
  selectMentionedProductsForPresentation,
  shouldSuppressProductArtifacts,
} from "../lib/product-presentation-policy";

const products = [
  { product_id: "p-1", variant_id: "v-1", title: "T-Shirt Suddenly Woman" },
  { product_id: "p-2", variant_id: "v-2", title: "Pantalone Lord Nero" },
  { product_id: "p-3", variant_id: "v-3", title: "Abito Hamar Lino" },
];

assert.deepEqual(
  selectMentionedProductsForPresentation({
    response: "Ti consiglio la T-Shirt Suddenly Woman e il Pantalone Lord Nero.",
    intent: "product_discovery",
    candidates: products,
  }).map((item) => item.product_id),
  ["p-1", "p-2"],
);

assert.deepEqual(
  selectMentionedProductsForPresentation({
    response: "Ho trovato l'Abito Hamar, disponibile nel catalogo verificato.",
    intent: "product_discovery",
    candidates: products,
  }).map((item) => item.product_id),
  ["p-3"],
);

assert.deepEqual(
  selectMentionedProductsForPresentation({
    response: "Che taglia porti di solito?",
    intent: "product_discovery",
    candidates: products,
  }),
  [],
);

assert.deepEqual(
  selectMentionedProductsForPresentation({
    response: "Il Pantalone Lord Nero è disponibile nelle taglie indicate.",
    intent: "variant_availability",
    candidates: products,
  }),
  [],
);

for (const intent of ["returns_policy", "shipping_policy", "order_tracking"] as const) {
  assert.equal(shouldSuppressProductArtifacts({ intent, usedKnowledgeBase: true }), true);
}
assert.equal(shouldSuppressProductArtifacts({ intent: "none", usedKnowledgeBase: true }), true);
assert.equal(shouldSuppressProductArtifacts({ intent: "product_discovery", usedKnowledgeBase: true }), false);
assert.equal(shouldSuppressProductArtifacts({ intent: "none", usedKnowledgeBase: false }), false);

console.log(JSON.stringify({ success: true, selectedProducts: 3, negativeCases: 6 }));
