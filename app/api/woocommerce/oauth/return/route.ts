import { NextRequest, NextResponse } from "next/server";
import { verifyWooCommerceOAuthState, wooSigningSecret } from "@/lib/woocommerce-signatures";

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("user_id") || "";
  const success = request.nextUrl.searchParams.get("success") === "1";
  const valid = verifyWooCommerceOAuthState(state, wooSigningSecret());
  const redirect = new URL("/integrations", request.nextUrl.origin);
  redirect.searchParams.set("woo", success && valid ? "connecting" : "error");
  if (!valid) redirect.searchParams.set("detail", "Sessione WooCommerce non valida o scaduta");
  else if (!success) redirect.searchParams.set("detail", "Autorizzazione WooCommerce annullata");
  return NextResponse.redirect(redirect);
}
