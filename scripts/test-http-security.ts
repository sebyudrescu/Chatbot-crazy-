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

const commerceWorkerRoute = readFileSync(resolve(process.cwd(), "app/api/internal/commerce-sync/route.ts"), "utf8");
assert.match(commerceWorkerRoute, /constantTimeEqual\(received, expected\)/);
assert.match(commerceWorkerRoute, /process\.env\.CRON_SECRET/);

console.log(JSON.stringify({ success: true, checks: 21 }));
