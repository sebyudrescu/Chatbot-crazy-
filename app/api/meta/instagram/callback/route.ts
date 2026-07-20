import { NextRequest, NextResponse } from "next/server";
import { metaConfiguration } from "@/lib/meta-config";
import { readMetaOAuthState } from "@/lib/meta-oauth-state";
import { saveMetaConnection } from "@/lib/meta-connections";

function channelsRedirect(request: NextRequest, status: string, detail?: string) {
  const target = new URL("/channels", request.url);
  target.searchParams.set("meta", status);
  if (detail) target.searchParams.set("detail", detail.slice(0, 160));
  return NextResponse.redirect(target);
}

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code")?.replace(/#_$/, "");
    const state = request.nextUrl.searchParams.get("state");
    const error = request.nextUrl.searchParams.get("error_description");
    if (error) return channelsRedirect(request, "error", error);
    if (!code || !state) throw new Error("Risposta Instagram incompleta");
    const parsedState = readMetaOAuthState(state);
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
    await saveMetaConnection({ botId: parsedState.botId, provider: "instagram", accessToken, details: { instagramAccountId: accountId, instagramUsername: profile.username, tokenExpiresAt: longToken.expires_in ? new Date(Date.now() + longToken.expires_in * 1000).toISOString() : undefined } });
    return channelsRedirect(request, "instagram-connected");
  } catch (error) {
    return channelsRedirect(request, "error", error instanceof Error ? error.message : "Collegamento Instagram non riuscito");
  }
}
