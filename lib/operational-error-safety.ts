const SECRET_ASSIGNMENT = /\b(api[_-]?key|authorization|bearer|password|secret|token|access[_-]?token|refresh[_-]?token)\b\s*[:=]\s*[^\s,;]+/gi;
const PROVIDER_SECRET = /\b(?:sk|re|shpat|shpca|shppa|whsec)_[a-z0-9_-]{12,}\b/gi;
const LONG_SECRET = /\b(?:[a-f0-9]{40,}|[a-z0-9+/]{48,}={0,2})\b/gi;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

export function sanitizeRequestPath(value: string | undefined) {
  const pathname = (value || "/").split("?", 1)[0]
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 300);
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

export function redactOperationalText(value: unknown, maximumLength = 4_000) {
  return String(value ?? "")
    .replace(/([?&][^=\s&]+)=([^&\s]+)/g, "$1=[redacted]")
    .replace(SECRET_ASSIGNMENT, "$1=[redacted]")
    .replace(PROVIDER_SECRET, "[secret]")
    .replace(LONG_SECRET, "[secret]")
    .replace(EMAIL, "[email]")
    .slice(0, maximumLength);
}

export function operationalErrorFingerprint(message: string, routePath: string, digest?: string) {
  const input = `${digest || ""}:${routePath}:${message}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
