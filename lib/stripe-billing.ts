import "server-only";

import Stripe from "stripe";
import { prisma } from "@/lib/db";

let stripeClient: Stripe | null = null;

export function billingConfiguration() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() || "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || "";
  const priceId = process.env.STRIPE_PRICE_ID?.trim() || "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";
  return {
    configured: Boolean(secretKey && webhookSecret && priceId && /^https:\/\//.test(appUrl)),
    checkoutConfigured: Boolean(secretKey && priceId && /^https:\/\//.test(appUrl)),
    secretKey,
    webhookSecret,
    priceId,
    appUrl,
  };
}

export function stripe() {
  const config = billingConfiguration();
  if (!config.secretKey) throw new Error("Billing Stripe non configurato");
  stripeClient ||= new Stripe(config.secretKey, { maxNetworkRetries: 2 });
  return stripeClient;
}

export function subscriptionPeriodEnd(subscription: Stripe.Subscription) {
  const value = subscription.items.data.reduce((latest, item) => Math.max(latest, item.current_period_end || 0), 0);
  return value ? new Date(value * 1000) : null;
}

export async function synchronizeStripeEvent(event: Stripe.Event) {
  const object = event.data.object;
  const customerId = "customer" in object && typeof object.customer === "string" ? object.customer : null;
  const metadataWorkspaceId = "metadata" in object && object.metadata ? object.metadata.workspaceId : null;
  const subscriptionId = object.object === "subscription" ? object.id : object.object === "checkout.session" && typeof object.subscription === "string" ? object.subscription : null;
  const workspace = metadataWorkspaceId
    ? await prisma.workspace.findUnique({ where: { id: metadataWorkspaceId }, select: { id: true } })
    : customerId
      ? await prisma.workspace.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } })
      : subscriptionId
        ? await prisma.workspace.findUnique({ where: { stripeSubscriptionId: subscriptionId }, select: { id: true } })
        : null;

  await prisma.$transaction(async tx => {
    const recorded = await tx.billingWebhookEvent.createMany({
      data: [{ eventId: event.id, eventType: event.type, workspaceId: workspace?.id || null }],
      skipDuplicates: true,
    });
    if (recorded.count === 0 || !workspace) return;

    if (object.object === "checkout.session") {
      await tx.workspace.update({
        where: { id: workspace.id },
        data: {
          stripeCustomerId: typeof object.customer === "string" ? object.customer : undefined,
          stripeSubscriptionId: typeof object.subscription === "string" ? object.subscription : undefined,
          billingStatus: object.payment_status === "paid" ? "active" : "pending",
          billingPlan: "pro",
        },
      });
    }

    if (object.object === "subscription") {
      await tx.workspace.update({
        where: { id: workspace.id },
        data: {
          stripeCustomerId: typeof object.customer === "string" ? object.customer : undefined,
          stripeSubscriptionId: object.id,
          stripePriceId: object.items.data[0]?.price.id || null,
          billingStatus: object.status,
          billingPlan: ["active", "trialing", "past_due"].includes(object.status) ? "pro" : "free",
          subscriptionCurrentPeriodEnd: subscriptionPeriodEnd(object),
        },
      });
    }
  });
}
