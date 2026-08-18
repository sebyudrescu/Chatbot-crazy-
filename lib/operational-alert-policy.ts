export type OperationalAlertLevel = "warning" | "critical";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const OPERATIONAL_ERROR_WINDOW_MS = HOUR_MS;
export const OPERATIONAL_TOKEN_WARNING_MS = 7 * DAY_MS;
export const OPERATIONAL_MIN_EVENT_SAMPLE = 20;

export function errorRateAlert(
  total: number,
  failed: number,
): { level: OperationalAlertLevel; rate: number } | null {
  if (!Number.isInteger(total) || !Number.isInteger(failed) || total < OPERATIONAL_MIN_EVENT_SAMPLE || failed <= 0) {
    return null;
  }
  const rate = Math.min(1, failed / total);
  if (rate >= 0.2) return { level: "critical", rate };
  if (rate >= 0.1) return { level: "warning", rate };
  return null;
}

export function tokenExpiryAlert(
  expiresAt: string | null | undefined,
  now = Date.now(),
): { level: OperationalAlertLevel; expiresAt: Date; remainingMs: number } | null {
  if (!expiresAt) return null;
  const timestamp = Date.parse(expiresAt);
  if (!Number.isFinite(timestamp)) return { level: "critical", expiresAt: new Date(0), remainingMs: Number.NEGATIVE_INFINITY };
  const remainingMs = timestamp - now;
  if (remainingMs <= 0) return { level: "critical", expiresAt: new Date(timestamp), remainingMs };
  if (remainingMs <= OPERATIONAL_TOKEN_WARNING_MS) return { level: "warning", expiresAt: new Date(timestamp), remainingMs };
  return null;
}

export function operationalWindowKey(prefix: string, id: string, now = Date.now()) {
  return `${prefix}:${id}:${Math.floor(now / OPERATIONAL_ERROR_WINDOW_MS)}`;
}
