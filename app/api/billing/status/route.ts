import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { billingConfiguration } from "@/lib/stripe-billing";
import {
  dashboardAuthErrorResponse,
  requireDashboardActor,
  requireWorkspacePermission,
} from "@/lib/workspace-auth";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireDashboardActor(request);
    const workspaceId = request.nextUrl.searchParams.get("workspaceId") || "";
    requireWorkspacePermission(actor, workspaceId, "workspace.read");
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        billingPlan: true,
        billingStatus: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        subscriptionCurrentPeriodEnd: true,
      },
    });
    if (!workspace)
      return NextResponse.json(
        { success: false, error: "Workspace non trovato" },
        { status: 404 },
      );
    return NextResponse.json({
      success: true,
      data: {
        ...workspace,
        hasCustomer: Boolean(workspace.stripeCustomerId),
        hasSubscription: Boolean(workspace.stripeSubscriptionId),
        stripeCustomerId: undefined,
        configured: billingConfiguration().configured,
      },
    });
  } catch (error) {
    const auth = dashboardAuthErrorResponse(error);
    if (auth) return auth;
    return NextResponse.json(
      { success: false, error: "Stato billing non disponibile" },
      { status: 500 },
    );
  }
}
