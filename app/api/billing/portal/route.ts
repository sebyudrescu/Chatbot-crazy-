import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { billingConfiguration, stripe } from "@/lib/stripe-billing";
import { dashboardAuthErrorResponse, requireDashboardActor, requireWorkspacePermission } from "@/lib/workspace-auth";

const Schema = z.object({ workspaceId: z.string().uuid() });

export async function POST(request: NextRequest) {
  try {
    const actor = await requireDashboardActor(request);
    const input = Schema.parse(await request.json());
    requireWorkspacePermission(actor, input.workspaceId, "billing.manage");
    const config = billingConfiguration();
    if (!config.checkoutConfigured) return NextResponse.json({ success: false, error: "Billing non ancora configurato dall’agenzia" }, { status: 503 });
    const workspace = await prisma.workspace.findUnique({ where: { id: input.workspaceId }, select: { stripeCustomerId: true } });
    if (!workspace?.stripeCustomerId) return NextResponse.json({ success: false, error: "Nessun profilo di fatturazione attivo" }, { status: 409 });
    const session = await stripe().billingPortal.sessions.create({ customer: workspace.stripeCustomerId, return_url: `${config.appUrl}/billing?workspaceId=${input.workspaceId}` });
    return NextResponse.json({ success: true, data: { url: session.url } });
  } catch (error) {
    const auth = dashboardAuthErrorResponse(error);
    if (auth) return auth;
    return NextResponse.json({ success: false, error: error instanceof z.ZodError ? "Richiesta non valida" : "Portale billing non disponibile" }, { status: 400 });
  }
}
