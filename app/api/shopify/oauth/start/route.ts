import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { SHOPIFY_SCOPES, shopifyEnvironment } from "@/lib/shopify-auth";
import { createShopifyOAuthState, normalizeShopDomain } from "@/lib/shopify-signatures";

const inputSchema = z.object({ botId: z.string().uuid(), shop: z.string().min(1).max(255) });

export async function GET(request: NextRequest) {
  const parsed = inputSchema.safeParse({
    botId: request.nextUrl.searchParams.get("botId"),
    shop: request.nextUrl.searchParams.get("shop"),
  });
  if (!parsed.success) return NextResponse.json({ success: false, error: "Dati Shopify non validi" }, { status: 400 });
  const shop = normalizeShopDomain(parsed.data.shop);
  if (!shop) return NextResponse.json({ success: false, error: "Usa il dominio nome-negozio.myshopify.com" }, { status: 400 });
  const [environment, chatbot] = await Promise.all([
    Promise.resolve(shopifyEnvironment()),
    prisma.chatbot.findUnique({ where: { id: parsed.data.botId }, select: { id: true } }),
  ]);
  if (!chatbot) return NextResponse.json({ success: false, error: "Agente non trovato" }, { status: 404 });
  if (!environment.ready) return NextResponse.json({ success: false, error: "Configura SHOPIFY_CLIENT_ID e SHOPIFY_CLIENT_SECRET su Vercel" }, { status: 503 });
  const state = createShopifyOAuthState(parsed.data.botId, shop, environment.clientSecret);
  const authorizationUrl = new URL(`https://${shop}/admin/oauth/authorize`);
  authorizationUrl.searchParams.set("client_id", environment.clientId);
  authorizationUrl.searchParams.set("scope", SHOPIFY_SCOPES.join(","));
  authorizationUrl.searchParams.set("redirect_uri", environment.callbackUrl);
  authorizationUrl.searchParams.set("state", state);
  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set("litx_shopify_oauth", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/shopify/oauth/callback",
    maxAge: 10 * 60,
  });
  return response;
}
