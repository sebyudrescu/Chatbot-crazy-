import { NextRequest, NextResponse } from "next/server";
import { readMetaClientLinkToken } from "@/lib/meta-client-link";
import { createMetaOAuthState } from "@/lib/meta-oauth-state";
import { metaConfiguration, metaReadiness } from "@/lib/meta-config";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token") || "";
    const link = readMetaClientLinkToken(token);
    if (link.provider !== "instagram") throw new Error("Questo link non è valido per Instagram");
    if (!metaReadiness("instagram")) throw new Error("Configurazione Instagram non disponibile");

    const meta = metaConfiguration();
    const redirectUri = `${meta.appUrl}/api/meta/instagram/callback`;
    const url = new URL("https://www.instagram.com/oauth/authorize");
    url.searchParams.set("enable_fb_login", "0");
    url.searchParams.set("force_authentication", "1");
    url.searchParams.set("client_id", meta.instagramAppId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "instagram_business_basic,instagram_business_manage_messages");
    url.searchParams.set("state", createMetaOAuthState(link.botId, "instagram", Date.now(), token));
    return NextResponse.json({ success: true, data: { url: url.toString() } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Collegamento Instagram non disponibile" },
      { status: 401 },
    );
  }
}
