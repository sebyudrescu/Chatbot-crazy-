import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { httpSecurityHeaders } from "../lib/http-security";

const production = httpSecurityHeaders("production");
const development = httpSecurityHeaders("development");
const csp = production["Content-Security-Policy"];

assert.match(csp, /object-src 'none'/);
assert.match(csp, /base-uri 'self'/);
assert.match(csp, /frame-ancestors 'none'/);
assert.match(csp, /upgrade-insecure-requests/);
assert.match(csp, /https:\/\/connect\.facebook\.net/);
assert.match(csp, /frame-src https:\/\/www\.facebook\.com https:\/\/web\.facebook\.com/);
assert.doesNotMatch(csp, /unsafe-eval/);
assert.match(development["Content-Security-Policy"], /unsafe-eval/);
assert.doesNotMatch(development["Content-Security-Policy"], /upgrade-insecure-requests/);
assert.equal(production["Strict-Transport-Security"], "max-age=63072000; includeSubDomains; preload");
assert.equal(development["Strict-Transport-Security"], undefined);
assert.match(production["Permissions-Policy"], /browsing-topics=\(\)/);
assert.equal(production["X-Frame-Options"], "DENY");
assert.equal(production["X-Content-Type-Options"], "nosniff");

const proxy = readFileSync(resolve(process.cwd(), "proxy.ts"), "utf8");
assert.match(proxy, /httpSecurityHeaders/);
assert.match(proxy, /withSecurityHeaders\(NextResponse\.redirect/);
assert.match(proxy, /'\/agent\/'/);
assert.match(proxy, /publicPaths[^\n]*'\/api\/internal\/commerce-sync'/);
assert.doesNotMatch(proxy, /publicPrefixes[^\n]*'\/api\/internal\/commerce-sync'/);
assert.match(proxy, /\.well-known\/workflow\//);

const commerceWorkerRoute = readFileSync(resolve(process.cwd(), "app/api/internal/commerce-sync/route.ts"), "utf8");
assert.match(commerceWorkerRoute, /constantTimeEqual\(received, expected\)/);
assert.match(commerceWorkerRoute, /process\.env\.CRON_SECRET/);

const durableRoutes = [
  "app/api/ingestion/crawl/route.ts",
  "app/api/knowledge-sources/crawl-with-progress/route.ts",
  "app/api/knowledge-sources/add-url/route.ts",
  "app/api/ingestion/retry/route.ts",
];
for (const route of durableRoutes) {
  const source = readFileSync(resolve(process.cwd(), route), "utf8");
  assert.match(source, /enqueueIngestionWorkflow/);
  assert.doesNotMatch(source, /processJobManually|after\(/);
}

const retiredWorker = readFileSync(resolve(process.cwd(), "app/api/worker/start/route.ts"), "utf8");
assert.match(retiredWorker, /status: 410/);

console.log(JSON.stringify({ success: true, checks: 31 }));
