import { NextRequest, NextResponse, after } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { saveWooCommerceConnection, registerWooCommerceWebhooks } from "@/lib/woocommerce-auth";
import { verifyWooCommerceOAuthState, wooSigningSecret } from "@/lib/woocommerce-signatures";
import { syncCommercePlatform } from "@/lib/commerce-platform-sync";
import { prisma } from "@/lib/db";

const schema = z.object({
  key_id: z.union([z.string(), z.number()]),
  user_id: z.string().min(20).max(3000),
  consumer_key: z.string().regex(/^ck_[A-Za-z0-9]+$/),
  consumer_secret: z.string().regex(/^cs_[A-Za-z0-9]+$/),
  key_permissions: z.enum(["read_write", "read", "write"]),
});

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Credenziali WooCommerce non valide" }, { status: 400 });
  const state = verifyWooCommerceOAuthState(parsed.data.user_id, wooSigningSecret());
  if (!state || parsed.data.key_permissions !== "read_write") return NextResponse.json({ success: false, error: "Autorizzazione WooCommerce non valida o scaduta" }, { status: 401 });
  const connection = await saveWooCommerceConnection({
    botId: state.botId,
    storeOrigin: state.storeOrigin,
    consumerKey: parsed.data.consumer_key,
    consumerSecret: parsed.data.consumer_secret,
    webhookSecret: randomBytes(32).toString("base64url"),
  });
  after(async () => {
    try {
      await registerWooCommerceWebhooks(connection);
      await syncCommercePlatform(state.botId, "woocommerce");
    } catch (error) {
      await prisma.integrationConnection.update({ where: { id: connection.id }, data: { status: "error", lastError: error instanceof Error ? error.message.slice(0, 1000) : "Setup WooCommerce non riuscito" } });
    }
  });
  return NextResponse.json({ success: true });
}
