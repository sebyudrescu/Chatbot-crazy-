import assert from "node:assert/strict";
import {
  buildContextualQuickReplies,
  buildInitialQuickReplies,
  catalogUnavailableResponse,
  detectBusinessMode,
  requiresVerifiedCatalog,
} from "../lib/conversation-guidance";

assert.equal(detectBusinessMode("Negozio ecommerce di abbigliamento uomo e donna"), "commerce");
assert.equal(detectBusinessMode("Studio di consulenza e servizi digitali"), "services");
assert.equal(requiresVerifiedCatalog("Puoi mostrarmi pantaloni da uomo in lino?", "commerce"), true);
assert.equal(requiresVerifiedCatalog("Avete vestiti per bambini?", "commerce"), true);
assert.equal(requiresVerifiedCatalog("Vorrei un preventivo per il sito", "services"), false);
assert.equal(buildInitialQuickReplies("commerce").some(reply => /preventivo|servizi/i.test(reply.text)), false);
assert.deepEqual(
  buildContextualQuickReplies({
    mode: "commerce",
    userMessage: "Avete vestiti per bambini?",
    assistantMessage: "Non abbiamo vestiti per bambini; vendiamo abbigliamento uomo e donna.",
    productCount: 0,
  }).map(reply => reply.text),
  ["Mostrami capi da uomo", "Mostrami capi da donna"],
);
assert.deepEqual(
  buildContextualQuickReplies({ mode: "commerce", userMessage: "Mostrami pantaloni", assistantMessage: "Catalogo non collegato", productCount: 0, catalogBlocked: true }).map(reply => reply.text),
  ["Vorrei parlare con una persona"],
);
assert.match(catalogUnavailableResponse(0), /catalogo prodotti verificato/i);
assert.doesNotMatch(catalogUnavailableResponse(0), /beige|blu|grigio/i);

console.log(JSON.stringify({ success: true, checks: 10 }));
