import assert from "node:assert/strict";
import {
  normalizeProductSurfaceCopy,
  selectMentionedProductsForPresentation,
  shouldRetryCatalogDiscovery,
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
assert.equal(
  normalizeProductSurfaceCopy("Le trovi nel carosello qui sopra.", true),
  "Le trovi nel carosello qui.",
);
assert.equal(
  normalizeProductSurfaceCopy("Le trovi nel carosello qui sotto.", true),
  "Le trovi nel carosello qui.",
);
assert.equal(
  normalizeProductSurfaceCopy("Le trovi qui sopra.", false),
  "Le trovi qui sopra.",
);

assert.equal(shouldRetryCatalogDiscovery({
  intent: "product_discovery",
  hasCategory: true,
  latestSearchFound: false,
  claimsNoResult: false,
}), true);
assert.equal(shouldRetryCatalogDiscovery({
  intent: "product_discovery",
  hasCategory: true,
  latestSearchFound: true,
  claimsNoResult: false,
}), false);
for (const intent of ["variant_availability", "product_detail"] as const) {
  assert.equal(shouldRetryCatalogDiscovery({
    intent,
    hasCategory: true,
    latestSearchFound: false,
    claimsNoResult: true,
  }), false);
}

console.log(JSON.stringify({ success: true, selectedProducts: 3, negativeCases: 10 }));
