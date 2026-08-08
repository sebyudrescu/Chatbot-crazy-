import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encryptConfigSecrets } from "@/lib/secret-config";
import {
  exchangeShopifyAuthorizationCode,
  SHOPIFY_SCOPES,
  shopifyConfigFromToken,
  shopifyEnvironment,
} from "@/lib/shopify-auth";
import { normalizeShopDomain, verifyShopifyOAuthHmac, verifyShopifyOAuthState } from "@/lib/shopify-signatures";
import { registerShopifyWebhooks } from "@/lib/shopify-webhooks";
import { enqueueCommerceSync } from "@/lib/commerce-sync-queue";
import { runCommerceSyncWorker } from "@/lib/commerce-sync-worker";

function integrationsRedirect(request: NextRequest, status: string, detail?: string) {
  const url = new URL("/integrations", request.nextUrl.origin);
  url.searchParams.set("shopify", status);
  if (detail) url.searchParams.set("detail", detail.slice(0, 240));
  const response = NextResponse.redirect(url);
  response.cookies.set("litx_shopify_oauth", "", { path: "/api/shopify/oauth/callback", maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  const environment = shopifyEnvironment();
  if (!environment.ready) return integrationsRedirect(request, "error", "Configurazione Shopify incompleta");
  const params = request.nextUrl.searchParams;
  const state = params.get("state") || "";
  const cookieState = request.cookies.get("litx_shopify_oauth")?.value || "";
  const decoded = verifyShopifyOAuthState(state, environment.clientSecret);
  const shop = normalizeShopDomain(params.get("shop") || "");
  const code = params.get("code") || "";
  if (!decoded || !shop || decoded.shop !== shop || !code || state !== cookieState) {
    return integrationsRedirect(request, "error", "Sessione Shopify non valida o scaduta");
  }
  if (!verifyShopifyOAuthHmac(params, environment.clientSecret)) {
    return integrationsRedirect(request, "error", "Firma Shopify non valida");
  }
  const timestamp = Number(params.get("timestamp"));
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 10 * 60) {
    return integrationsRedirect(request, "error", "Callback Shopify scaduta");
  }
  try {
    const token = await exchangeShopifyAuthorizationCode(shop, code);
    const grantedScopes = new Set(token.scope.split(",").map((scope) => scope.trim()));
    if (SHOPIFY_SCOPES.some((scope) => !grantedScopes.has(scope))) throw new Error("Shopify non ha concesso il permesso read_products");
    const config = shopifyConfigFromToken(shop, token);
    const connection = await prisma.integrationConnection.upsert({
      where: { botId_provider: { botId: decoded.botId, provider: "shopify" } },
      create: {
        botId: decoded.botId,
        provider: "shopify",
        category: "commerce",
        displayName: "Shopify",
        externalAccountId: shop,
        config: JSON.stringify(encryptConfigSecrets(config)),
        status: "connecting",
        enabled: true,
      },
      update: {
        externalAccountId: shop,
        config: JSON.stringify(encryptConfigSecrets(config)),
        status: "connecting",
        enabled: true,
        lastError: null,
      },
    });
    after(async () => {
      try {
        await registerShopifyWebhooks(connection);
        const { job } = await enqueueCommerceSync(decoded.botId, "shopify");
        await runCommerceSyncWorker(job.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Inizializzazione Shopify non riuscita";
        await prisma.integrationConnection.updateMany({
          where: { botId: decoded.botId, provider: "shopify" },
          data: { status: "error", lastError: message.slice(0, 1000) },
        });
      }
    });
    return integrationsRedirect(request, "connecting");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Collegamento Shopify non riuscito";
    await prisma.integrationConnection.updateMany({
      where: { botId: decoded.botId, provider: "shopify" },
      data: { status: "error", lastError: message.slice(0, 1000) },
    });
    return integrationsRedirect(request, "error", message);
  }
}
