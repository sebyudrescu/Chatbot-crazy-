import assert from 'node:assert/strict';
import { matchesSourceEvidence, sourceEvidenceSchema, sourceDraftSchema } from '../lib/evaluation-source-evidence';

const text = 'Lo studio riceve su appuntamento dal lunedì al venerdì. Il sabato è chiuso.';
assert(matchesSourceEvidence(text, 'Lo studio riceve su appuntamento dal lunedì al venerdì.', ['appuntamento', 'lunedì']));
assert(matchesSourceEvidence(text, 'Lo studio riceve\nsu appuntamento dal lunedì al venerdì.', ['appuntamento']));
assert(!matchesSourceEvidence(text, 'Lo studio riceve anche la domenica senza appuntamento.', ['domenica']));
assert(!matchesSourceEvidence(text, text, ['domenica']));
assert(!matchesSourceEvidence(text, text, []));
assert(!matchesSourceEvidence(text, 'studio', ['studio']));
assert(!sourceEvidenceSchema.safeParse({ sourceId: 'foreign', chunkId: 'missing', quote: text }).success);
assert(!sourceDraftSchema.safeParse({ name: 'Test', question: 'Quando?', expectedKeywords: [], chunkId: '00000000-0000-4000-8000-000000000001', quote: text }).success);
console.log('Evaluation source evidence: 8 checks passed');
