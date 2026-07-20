import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createMetaOAuthState } from "@/lib/meta-oauth-state";
import { metaConfiguration, metaReadiness } from "@/lib/meta-config";

export async function GET(request: NextRequest) {
  const botId = z.string().uuid().safeParse(request.nextUrl.searchParams.get("botId"));
  if (!botId.success) return NextResponse.json({ success: false, error: "Agente non valido" }, { status: 400 });
  if (!metaReadiness("instagram")) return NextResponse.json({ success: false, error: "Completa prima la configurazione Meta nelle variabili server." }, { status: 503 });
  const meta = metaConfiguration();
  const redirectUri = `${meta.appUrl}/api/meta/instagram/callback`;
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("enable_fb_login", "0");
  url.searchParams.set("force_authentication", "1");
  url.searchParams.set("client_id", meta.instagramAppId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "instagram_business_basic,instagram_business_manage_messages");
  url.searchParams.set("state", createMetaOAuthState(botId.data, "instagram"));
  return NextResponse.json({ success: true, data: { url: url.toString() } });
}
