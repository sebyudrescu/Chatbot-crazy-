const ALERT_WINDOW_MS = 60 * 60 * 1000;

export function systemErrorAlertKey(fingerprint: string, now = Date.now()) {
  const safeFingerprint = fingerprint.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 64) || "unknown";
  return `system-email:${safeFingerprint}:${Math.floor(now / ALERT_WINDOW_MS)}`;
}
