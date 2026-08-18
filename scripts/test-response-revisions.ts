import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertRevisionHasNoSensitiveData,
  deriveRevisionKeywords,
  RevisionDraftSchema,
  uniqueRevisionKeywords,
} from "../lib/response-revision-policy";

const root = process.cwd();
const service = readFileSync(resolve(root, "lib/response-revisions.ts"), "utf8");
const conversationApi = readFileSync(resolve(root, "app/api/conversations/[id]/route.ts"), "utf8");
const knowledgeApi = readFileSync(resolve(root, "app/api/knowledge-sources/route.ts"), "utf8");
const conversationsUi = readFileSync(resolve(root, "app/conversations/page.tsx"), "utf8");
const migration = readFileSync(resolve(root, "prisma/migrations/20260818150000_add_response_revisions/migration.sql"), "utf8");

assert.deepEqual(uniqueRevisionKeywords([" lino ", "lino", "donna"]), ["lino", "donna"]);
const derived = deriveRevisionKeywords("Camicia elegante in lino disponibile per donna, lino italiano traspirante.");
assert.ok(derived.includes("lino"));
assert.ok(derived.includes("disponibile"));
assert.doesNotThrow(() => assertRevisionHasNoSensitiveData("Avete camicie?", "Sì, abbiamo camicie in lino."));
for (const sensitive of ["cliente@example.com", "+39 333 123 4567", "sk_exampletoken123456", "4111 1111 1111 1111"]) {
  assert.throws(() => assertRevisionHasNoSensitiveData("Domanda", sensitive), /Rimuovi email/);
}
assert.equal(RevisionDraftSchema.safeParse({ revisedAnswer: "troppo" }).success, false);
assert.equal(RevisionDraftSchema.safeParse({ revisedAnswer: "Risposta verificata sufficientemente lunga", forbiddenKeywords: [] }).success, true);

assert.match(service, /status: \{ in: \["draft", "failed"\] \}/);
assert.match(service, /status: "publishing"/);
assert.match(service, /status: "failed"/);
assert.match(service, /restoreSourceReplica/);
assert.match(service, /evaluationCase\.create/);
assert.match(service, /sourceType: "qa"/);
assert.match(service, /status: "archived"/);
assert.match(service, /status: "archiving"/);
assert.match(service, /where: \{ id, status: "archiving" \}, data: \{ status: "published" \}/);
assert.match(conversationApi, /responseRevisions: \{ orderBy: \{ version: 'desc' \} \}/);
assert.match(knowledgeApi, /Le Q&A verificate vanno archiviate dai Chat Logs/);
assert.match(conversationsUi, /Correggi e insegna/);
assert.match(conversationsUi, /Pubblica Q&A verificata/);
assert.match(conversationsUi, /Il messaggio storico resta immutato/);
assert.match(migration, /UNIQUE INDEX "response_revisions_assistantMessageId_version_key"/);
assert.match(migration, /ON DELETE CASCADE/);

console.log("Response revisions: 30 controlli superati");
