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
const web = { ...source('completed', 3), sourceType: 'url', originalFilename: null, sourceUrl: 'https://user:password@example.com/pages/shipping?token=secret#private' };
assert.equal(buildKnowledgeAudit([web], 0).items[0].name, 'example.com/pages/shipping');
assert.equal(buildKnowledgeAudit([{ ...web, sourceUrl: 'invalid' }], 0).items[0].name, 'url · source-o');
assert.equal(buildKnowledgeAudit([{ ...web, sourceUrl: 'javascript:alert(1)' }], 0).items[0].name, 'url · source-o');
assert.equal(buildKnowledgeAudit([{ ...web, originalFilename: 'Shipping.pdf' }], 0).items[0].name, 'Shipping.pdf');
const duplicates = buildKnowledgeAudit([web, { ...web, id: 'second-source' }], 0).items;
assert.equal(duplicates[0].name, 'example.com/pages/shipping · source-o');
assert.equal(duplicates[1].name, 'example.com/pages/shipping · second-s');
console.log('Knowledge audit: all checks passed');
