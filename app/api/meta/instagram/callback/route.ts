import { NextRequest, NextResponse } from "next/server";
import { metaConfiguration } from "@/lib/meta-config";
import { readMetaOAuthState } from "@/lib/meta-oauth-state";
import { saveMetaConnection } from "@/lib/meta-connections";
import { readMetaClientLinkToken } from "@/lib/meta-client-link";
import { assertMetaClientLinkUnused } from "@/lib/meta-client-link-usage";

function channelsRedirect(request: NextRequest, status: string, detail?: string) {
  const target = new URL("/channels", request.url);
  target.searchParams.set("meta", status);
  if (detail) target.searchParams.set("detail", detail.slice(0, 160));
  return NextResponse.redirect(target);
}

function clientRedirect(request: NextRequest, token: string, status: string, detail?: string) {
  const target = new URL("/connect/meta", request.url);
  target.searchParams.set("token", token);
  target.searchParams.set("meta", status);
  if (detail) target.searchParams.set("detail", detail.slice(0, 160));
  return NextResponse.redirect(target);
}

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code")?.replace(/#_$/, "");
    const state = request.nextUrl.searchParams.get("state");
    const error = request.nextUrl.searchParams.get("error_description");
    if (error) throw new Error(error);
    if (!code || !state) throw new Error("Risposta Instagram incompleta");
    const parsedState = readMetaOAuthState(state);
    if (parsedState.clientToken) {
      const clientLink = readMetaClientLinkToken(parsedState.clientToken);
      if (clientLink.botId !== parsedState.botId || clientLink.provider !== "instagram") {
        throw new Error("Collegamento cliente non valido");
      }
      await assertMetaClientLinkUnused(clientLink);
    }
    const meta = metaConfiguration();
    const form = new URLSearchParams({ client_id: meta.instagramAppId, client_secret: meta.instagramAppSecret, grant_type: "authorization_code", redirect_uri: `${meta.appUrl}/api/meta/instagram/callback`, code });
    const tokenResponse = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form });
    const token = await tokenResponse.json() as { access_token?: string; user_id?: number | string; error_message?: string };
    if (!tokenResponse.ok || !token.access_token) throw new Error(token.error_message || "Token Instagram non disponibile");
    const longTokenUrl = new URL(`${meta.instagramGraphBaseUrl}/access_token`);
    longTokenUrl.searchParams.set("grant_type", "ig_exchange_token");
    longTokenUrl.searchParams.set("client_secret", meta.instagramAppSecret);
    longTokenUrl.searchParams.set("access_token", token.access_token);
    const longTokenResponse = await fetch(longTokenUrl);
    const longToken = await longTokenResponse.json().catch(() => ({})) as { access_token?: string; expires_in?: number };
    const accessToken = longTokenResponse.ok && longToken.access_token ? longToken.access_token : token.access_token;
    const profileResponse = await fetch(`${meta.instagramGraphBaseUrl}/${meta.graphVersion}/me?fields=user_id,username&access_token=${encodeURIComponent(accessToken)}`);
    const profile = await profileResponse.json() as { user_id?: string; id?: string; username?: string; error?: { message?: string } };
    const accountId = String(profile.user_id || profile.id || token.user_id || "");
    if (!profileResponse.ok || !accountId) throw new Error(profile.error?.message || "Account professionale Instagram non trovato");
    const subscriptionUrl = new URL(`${meta.instagramGraphBaseUrl}/${meta.graphVersion}/${accountId}/subscribed_apps`);
    subscriptionUrl.searchParams.set("subscribed_fields", "messages,messaging_postbacks");
    const subscriptionResponse = await fetch(subscriptionUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    const subscription = await subscriptionResponse.json().catch(() => ({})) as { success?: boolean; error?: { message?: string } };
    if (!subscriptionResponse.ok || subscription.success !== true) {
      throw new Error(subscription.error?.message || "Impossibile attivare i webhook Instagram per questo account");
    }
    if (parsedState.clientToken) {
      await assertMetaClientLinkUnused(readMetaClientLinkToken(parsedState.clientToken));
    }
    await saveMetaConnection({ botId: parsedState.botId, provider: "instagram", accessToken, details: { instagramAccountId: accountId, instagramUsername: profile.username, tokenExpiresAt: longToken.expires_in ? new Date(Date.now() + longToken.expires_in * 1000).toISOString() : undefined } });
    return parsedState.clientToken
      ? clientRedirect(request, parsedState.clientToken, "instagram-connected")
      : channelsRedirect(request, "instagram-connected");
  } catch (error) {
    const state = request.nextUrl.searchParams.get("state");
    if (state) {
      try {
        const parsed = readMetaOAuthState(state);
        if (parsed.clientToken) {
          return clientRedirect(request, parsed.clientToken, "error", error instanceof Error ? error.message : "Collegamento Instagram non riuscito");
        }
      } catch {}
    }
    return channelsRedirect(request, "error", error instanceof Error ? error.message : "Collegamento Instagram non riuscito");
  }
}
