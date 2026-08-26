import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSafeRemoteUrl } from "@/lib/url-safety";
import { wooCommerceEnvironment } from "@/lib/woocommerce-auth";
import { createWooCommerceOAuthState, wooSigningSecret } from "@/lib/woocommerce-signatures";
import { dashboardAuthErrorResponse, requireBotPermission, requireDashboardActor } from "@/lib/workspace-auth";

const schema = z.object({ botId: z.string().uuid(), store: z.string().min(1).max(2048) });

export async function GET(request: NextRequest) {
  try {
    const parsed = schema.safeParse({ botId: request.nextUrl.searchParams.get("botId"), store: request.nextUrl.searchParams.get("store") });
    if (!parsed.success) return NextResponse.json({ success: false, error: "Dati WooCommerce non validi" }, { status: 400 });
    const actor = await requireDashboardActor(request);
    await requireBotPermission(actor, parsed.data.botId, "chatbot.write");
    const store = await assertSafeRemoteUrl(parsed.data.store);
    const environment = wooCommerceEnvironment();
    if (!environment.ready) return NextResponse.json({ success: false, error: "NEXT_PUBLIC_APP_URL non configurato" }, { status: 503 });
    const state = createWooCommerceOAuthState(parsed.data.botId, store.origin, wooSigningSecret());
    const authorizationUrl = new URL("/wc-auth/v1/authorize", store.origin);
    authorizationUrl.searchParams.set("app_name", "LitX AI");
    authorizationUrl.searchParams.set("scope", "read_write");
    authorizationUrl.searchParams.set("user_id", state);
    authorizationUrl.searchParams.set("return_url", environment.returnUrl);
    authorizationUrl.searchParams.set("callback_url", environment.callbackUrl);
    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Connessione WooCommerce non riuscita" }, { status: 400 });
  }
}
