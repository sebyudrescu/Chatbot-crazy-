export type OperationalAlertLevel = "warning" | "critical";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const OPERATIONAL_ERROR_WINDOW_MS = HOUR_MS;
export const OPERATIONAL_TOKEN_WARNING_MS = 7 * DAY_MS;
export const OPERATIONAL_MIN_EVENT_SAMPLE = 20;
export const OPERATIONAL_MIN_JOB_SAMPLE = 5;
export const INGESTION_SLO_THRESHOLDS = {
  warningDurationMs: 10 * 60_000,
  criticalDurationMs: 20 * 60_000,
  warningQueueMs: 2 * 60_000,
  criticalQueueMs: 5 * 60_000,
};
export const COMMERCE_SLO_THRESHOLDS = {
  warningDurationMs: 15 * 60_000,
  criticalDurationMs: 30 * 60_000,
  warningQueueMs: 2 * 60_000,
  criticalQueueMs: 5 * 60_000,
};

export type OperationalJobSample = {
  status: string;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  runStartedAt?: Date | null;
};

export type OperationalJobSlo = {
  sampleSize: number;
  completed: number;
  failed: number;
  successRate: number | null;
  p95DurationMs: number | null;
  p95QueueWaitMs: number | null;
};

function percentile95(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1];
}

export function summarizeOperationalJobs(jobs: OperationalJobSample[]): OperationalJobSlo {
  const terminal = jobs.filter((job) => job.status === "completed" || job.status === "failed");
  const completed = terminal.filter((job) => job.status === "completed").length;
  const failed = terminal.length - completed;
  const durations = terminal.flatMap((job) => {
    const startedAt = job.runStartedAt || job.startedAt;
    if (!startedAt || !job.completedAt) return [];
    return [Math.max(0, job.completedAt.getTime() - startedAt.getTime())];
  });
  const queueWaits = terminal.flatMap((job) => {
    const startedAt = job.runStartedAt || job.startedAt;
    if (!startedAt) return [];
    return [Math.max(0, startedAt.getTime() - job.createdAt.getTime())];
  });
  return {
    sampleSize: terminal.length,
    completed,
    failed,
    successRate: terminal.length ? completed / terminal.length : null,
    p95DurationMs: percentile95(durations),
    p95QueueWaitMs: percentile95(queueWaits),
  };
}

export function jobSloAlert(
  slo: OperationalJobSlo,
  thresholds: { warningDurationMs: number; criticalDurationMs: number; warningQueueMs: number; criticalQueueMs: number },
): { level: OperationalAlertLevel; reason: "success_rate" | "duration" | "queue" } | null {
  if (slo.sampleSize < OPERATIONAL_MIN_JOB_SAMPLE) return null;
  if (slo.successRate !== null && slo.successRate < 0.75) return { level: "critical", reason: "success_rate" };
  if (slo.p95DurationMs !== null && slo.p95DurationMs >= thresholds.criticalDurationMs) return { level: "critical", reason: "duration" };
  if (slo.p95QueueWaitMs !== null && slo.p95QueueWaitMs >= thresholds.criticalQueueMs) return { level: "critical", reason: "queue" };
  if (slo.successRate !== null && slo.successRate < 0.9) return { level: "warning", reason: "success_rate" };
  if (slo.p95DurationMs !== null && slo.p95DurationMs >= thresholds.warningDurationMs) return { level: "warning", reason: "duration" };
  if (slo.p95QueueWaitMs !== null && slo.p95QueueWaitMs >= thresholds.warningQueueMs) return { level: "warning", reason: "queue" };
  return null;
}

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
