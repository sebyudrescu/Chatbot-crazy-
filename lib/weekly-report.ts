import { sanitizeConversationTopic } from './conversation-insights';

export interface WeeklyConversation {
  id: string; startedAt: Date; userSessionId: string; topicsDiscussed: string | null;
  needsHumanEscalation: boolean; isResolved: boolean;
}
export function buildWeeklyReport(rows: WeeklyConversation[], now: Date) {
  const start = new Date(now.getTime() - 7 * 86400000);
  const previousStart = new Date(start.getTime() - 7 * 86400000);
  const inWindow = rows.filter(row => row.startedAt >= previousStart && row.startedAt < now);
  const isTest = (row: WeeklyConversation) => /^(evaluation_|test_|ab_|preview_)/.test(row.userSessionId);
  const excludedTests = inWindow.filter(isTest).length;
  const eligible = inWindow.filter(row => !isTest(row));
  const current = eligible.filter(row => row.startedAt >= start);
  const previous = eligible.length - current.length;
  const topics = new Map<string, Set<string>>();
  let classified = 0;
  for (const row of current) {
    let values: unknown = [];
    try { values = JSON.parse(row.topicsDiscussed || '[]'); } catch { /* Unknown remains unclassified. */ }
    const labels = Array.isArray(values) ? [...new Set(values.map(sanitizeConversationTopic).filter((label): label is string => !!label))] : [];
    if (labels.length) classified++;
    for (const label of labels) {
      const ids = topics.get(label) || new Set<string>();
      ids.add(row.id); topics.set(label, ids);
    }
  }
  return {
    start: start.toISOString(), end: now.toISOString(), previousStart: previousStart.toISOString(),
    conversations: current.length, previousConversations: previous,
    changePercent: previous ? Math.round((current.length - previous) / previous * 100) : null,
    excludedTests, classified, unclassified: current.length - classified,
    topics: [...topics].map(([label, ids]) => ({ label, count: ids.size, percent: Math.round(ids.size / current.length * 100), conversationIds: [...ids].slice(0, 5) })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 10),
    attention: current.filter(row => row.needsHumanEscalation && !row.isResolved).map(row => row.id),
  };
}
export type WeeklyReport = ReturnType<typeof buildWeeklyReport>;
