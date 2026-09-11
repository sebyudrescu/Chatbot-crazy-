import assert from 'node:assert/strict';
import { buildWeeklyReport, type WeeklyConversation } from '../lib/weekly-report';
const now = new Date('2026-09-11T12:00:00Z');
const row = (id: string, date: string, topics = '["orari", "orari"]'): WeeklyConversation => ({ id, startedAt: new Date(date), userSessionId: id, topicsDiscussed: topics, needsHumanEscalation: false, isResolved: false });
const result = buildWeeklyReport([
  row('a', '2026-09-04T12:00:00Z'), row('b', '2026-09-10T12:00:00Z', 'broken'),
  row('previous', '2026-09-04T11:59:59Z'), row('old', '2026-08-20T12:00:00Z'),
  row('future', '2026-09-11T12:00:00Z'), row('evaluation_a', '2026-09-10T12:00:00Z'),
  row('preview_a', '2026-09-10T12:00:00Z'),
], now);
assert.equal(result.conversations, 2);
assert.equal(result.previousConversations, 1);
assert.equal(result.changePercent, 100);
assert.equal(result.excludedTests, 2);
assert.equal(result.unclassified, 1);
assert.equal(result.topics[0].count, 1);
assert.equal(result.topics[0].percent, 50);
assert.deepEqual(result.topics[0].conversationIds, ['a']);
assert.equal(buildWeeklyReport([], now).changePercent, null);
assert.deepEqual(buildWeeklyReport([], now).topics, []);
assert.equal(buildWeeklyReport([row('x', '2026-09-10T12:00:00Z', '["persona@example.com"]')], now).unclassified, 1);
console.log('Weekly report evidence checks passed');
