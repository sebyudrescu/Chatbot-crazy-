export const SUGGESTION_REFRESH_WINDOW_MS = 5 * 60 * 1000;

export function isSuggestionRefreshFresh(lastSuccess: Date | null, now = new Date()) {
  if (!lastSuccess) return false;
  return now.getTime() - lastSuccess.getTime() < SUGGESTION_REFRESH_WINDOW_MS;
}
