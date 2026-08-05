import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  operationalErrorFingerprint,
  redactOperationalText,
  sanitizeRequestPath,
} from "../lib/operational-error-safety";

assert.equal(sanitizeRequestPath("/api/chat?token=private&email=user@example.com"), "/api/chat");
assert.equal(sanitizeRequestPath("api/health\nignored"), "/api/healthignored");

const redacted = redactOperationalText(
  "authorization=Bearer-private token=abc123456789012345678901 password=hunter2 email user@example.com https://example.com/callback?code=oauth-secret",
);
assert.doesNotMatch(redacted, /Bearer-private|abc123456789012345678901|hunter2|user@example\.com|oauth-secret/);
assert.match(redacted, /authorization=\[redacted\]/i);
assert.match(redacted, /token=\[redacted\]/i);
assert.match(redacted, /password=\[redacted\]/i);
assert.match(redacted, /\[email\]/);
assert.match(redacted, /code=\[redacted\]/);

assert.equal(redactOperationalText("word ".repeat(20), 20).length, 20);
assert.equal(
  operationalErrorFingerprint("boom", "/api/chat", "digest-1"),
  operationalErrorFingerprint("boom", "/api/chat", "digest-1"),
);
assert.notEqual(
  operationalErrorFingerprint("boom", "/api/chat", "digest-1"),
  operationalErrorFingerprint("boom", "/api/commerce", "digest-1"),
);

const instrumentation = readFileSync(resolve(process.cwd(), "instrumentation.ts"), "utf8");
assert.match(instrumentation, /Instrumentation\.onRequestError/);
assert.match(instrumentation, /\/api\/internal\/observability/);
assert.doesNotMatch(instrumentation, /error-observability|from ["']\.\/lib\/db/);

const collector = readFileSync(resolve(process.cwd(), "app/api/internal/observability/route.ts"), "utf8");
assert.match(collector, /constantTimeEqual/);
assert.match(collector, /system\.request\.unhandled/);
assert.match(collector, /redactOperationalText/);

const notifications = readFileSync(resolve(process.cwd(), "app/api/notifications/route.ts"), "utf8");
assert.match(notifications, /system\.request\.unhandled/);
assert.match(notifications, /system-error:/);

console.log(JSON.stringify({ success: true, checks: 20 }));
