import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { billingConfiguration, stripe } from "@/lib/stripe-billing";
import { dashboardAuthErrorResponse, requireDashboardActor, requireWorkspacePermission } from "@/lib/workspace-auth";
import { checkRateLimit, requestClientIp } from "@/lib/rate-limit";

const Schema = z.object({ workspaceId: z.string().uuid() });

export async function POST(request: NextRequest) {
  try {
    const actor = await requireDashboardActor(request);
    const input = Schema.parse(await request.json());
    requireWorkspacePermission(actor, input.workspaceId, "billing.manage");
    const limit = await checkRateLimit(`billing-checkout:${input.workspaceId}:${requestClientIp(request.headers)}`, 8, 15 * 60_000);
    if (!limit.allowed) return NextResponse.json({ success: false, error: "Troppi tentativi. Riprova più tardi." }, { status: 429 });
    const config = billingConfiguration();
    if (!config.checkoutConfigured) return NextResponse.json({ success: false, error: "Billing non ancora configurato dall’agenzia" }, { status: 503 });

    const workspace = await prisma.workspace.findUnique({ where: { id: input.workspaceId }, select: { id: true, name: true, stripeCustomerId: true, stripeSubscriptionId: true, billingStatus: true } });
    if (!workspace) return NextResponse.json({ success: false, error: "Workspace non trovato" }, { status: 404 });
    if (workspace.stripeSubscriptionId && ["active", "trialing", "past_due"].includes(workspace.billingStatus)) {
      return NextResponse.json({ success: false, error: "Il workspace ha già un abbonamento. Usa Gestisci su Stripe." }, { status: 409 });
    }
    let customerId = workspace.stripeCustomerId;
    if (!customerId) {
      const email = actor.kind === "user" ? (await prisma.user.findUnique({ where: { id: actor.userId }, select: { email: true } }))?.email : undefined;
      const customer = await stripe().customers.create({ name: workspace.name, email, metadata: { workspaceId: workspace.id } }, { idempotencyKey: `workspace-customer-${workspace.id}` });
      customerId = customer.id;
      await prisma.workspace.update({ where: { id: workspace.id }, data: { stripeCustomerId: customerId } });
    }
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: config.priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${config.appUrl}/billing?workspaceId=${workspace.id}&checkout=success`,
      cancel_url: `${config.appUrl}/billing?workspaceId=${workspace.id}&checkout=cancelled`,
      client_reference_id: workspace.id,
      metadata: { workspaceId: workspace.id },
      subscription_data: { metadata: { workspaceId: workspace.id } },
    });
    return NextResponse.json({ success: true, data: { url: session.url } });
  } catch (error) {
    const auth = dashboardAuthErrorResponse(error);
    if (auth) return auth;
    return NextResponse.json({ success: false, error: error instanceof z.ZodError ? "Richiesta non valida" : "Checkout non disponibile" }, { status: 400 });
  }
}
