import assert from 'node:assert/strict';
import { buildKnowledgeAudit, type AuditedSource } from '../lib/knowledge-audit';

const source = (status: string, chunks: number): AuditedSource => ({ id: 'source-one', status, sourceType: 'pdf', originalFilename: 'Servizi.pdf', processedAt: null, _count: { chunks } });
assert.equal(buildKnowledgeAudit([], 0).operationallyReady, false);
assert.equal(buildKnowledgeAudit([source('completed', 3)], 0).operationallyReady, true);
assert.equal(buildKnowledgeAudit([source('completed', 3)], 1).operationallyReady, false);
for (const status of ['failed', 'pending', 'processing', 'unrecognized']) {
  assert.equal(buildKnowledgeAudit([source(status, 3)], 0).operationallyReady, false);
}
assert.equal(buildKnowledgeAudit([source('completed', 0)], 0).empty, 1);
const result = buildKnowledgeAudit([source('completed', 3), source('failed', 0)], 0);
assert.equal(result.indexed, 1);
assert.equal(result.failed, 1);
assert.equal(result.operationallyReady, false);
assert.equal(result.semanticCoverage, 'not_assessed');
assert.equal(result.contradictions, 'not_assessed');
console.log('Knowledge audit: all checks passed');
