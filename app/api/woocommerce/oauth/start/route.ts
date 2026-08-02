import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertSafeRemoteUrl } from "@/lib/url-safety";
import { wooCommerceEnvironment } from "@/lib/woocommerce-auth";
import { createWooCommerceOAuthState, wooSigningSecret } from "@/lib/woocommerce-signatures";

const schema = z.object({ botId: z.string().uuid(), store: z.string().min(1).max(2048) });

export async function GET(request: NextRequest) {
  const parsed = schema.safeParse({ botId: request.nextUrl.searchParams.get("botId"), store: request.nextUrl.searchParams.get("store") });
  if (!parsed.success) return NextResponse.json({ success: false, error: "Dati WooCommerce non validi" }, { status: 400 });
  const [store, chatbot] = await Promise.all([
    assertSafeRemoteUrl(parsed.data.store),
    prisma.chatbot.findUnique({ where: { id: parsed.data.botId }, select: { id: true } }),
  ]);
  if (!chatbot) return NextResponse.json({ success: false, error: "Agente non trovato" }, { status: 404 });
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
}
