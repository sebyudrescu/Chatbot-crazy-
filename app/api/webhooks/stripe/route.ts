import { NextRequest, NextResponse } from "next/server";
import { billingConfiguration, stripe, synchronizeStripeEvent } from "@/lib/stripe-billing";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const config = billingConfiguration();
  if (!config.webhookSecret) return NextResponse.json({ success: false, error: "Webhook non configurato" }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ success: false, error: "Firma mancante" }, { status: 400 });
  try {
    const event = stripe().webhooks.constructEvent(await request.text(), signature, config.webhookSecret);
    await synchronizeStripeEvent(event);
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ success: false, error: "Firma o evento non valido" }, { status: 400 });
  }
}
