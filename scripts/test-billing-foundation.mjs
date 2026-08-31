import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [schema, migration, checkout, portal, webhook, register, verify, proxy, env] = await Promise.all([
  read("prisma/schema.prisma"),
  read("prisma/migrations/20260831160000_add_workspace_billing/migration.sql"),
  read("app/api/billing/checkout/route.ts"),
  read("app/api/billing/portal/route.ts"),
  read("app/api/webhooks/stripe/route.ts"),
  read("app/api/auth/register/route.ts"),
  read("app/api/auth/email-verification/confirm/route.ts"),
  read("proxy.ts"),
  read(".env.example"),
]);

assert.match(schema, /stripeCustomerId\s+String\?\s+@unique/);
assert.match(schema, /model BillingWebhookEvent/);
assert.match(migration, /billing_webhook_events_eventId_key/);
assert.match(checkout, /requireWorkspacePermission\(actor, input\.workspaceId, "billing\.manage"\)/);
assert.match(checkout, /line_items: \[\{ price: config\.priceId/);
assert.doesNotMatch(checkout, /input\.priceId/);
assert.match(portal, /billingPortal\.sessions\.create/);
assert.match(webhook, /constructEvent\(await request\.text\(\), signature/);
assert.match(register, /SELF_SERVICE_SIGNUP_ENABLED !== "true"/);
assert.match(register, /role: "owner"/);
assert.match(register, /pending_verification/);
assert.match(verify, /emailVerifiedAt: now, status: "active"/);
assert.match(proxy, /\/api\/webhooks\/stripe/);
for (const key of ["SELF_SERVICE_SIGNUP_ENABLED", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ID"]) assert.match(env, new RegExp(key));

console.log("Billing and self-service onboarding contract tests passed");
