import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { decryptConfigSecrets } from "@/lib/secret-config";
import { verifyCommerceConversionSignature } from "@/lib/commerce-conversion-signatures";
import { safeHttpsUrl } from "@/lib/commerce-types";
import { checkRateLimit, requestClientIp } from "@/lib/rate-limit";
import { resolveCommerceAttribution, sanitizeCommerceMetadata } from "@/lib/commerce-attribution";

const schema = z.object({
  eventType: z.enum(["checkout", "conversion"]),
  externalEventId: z.string().min(1).max(200),
  conversationId: z.string().uuid().optional(),
  productExternalId: z.string().min(1).max(300).optional(),
  variantExternalId: z.string().min(1).max(300).optional(),
  sessionId: z.string().min(1).max(300).optional(),
  pageUrl: z.string().url().max(2048).optional(),
  value: z.number().finite().nonnegative().max(100_000_000).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  metadata: z.record(z.union([z.string().max(500), z.number().finite(), z.boolean()])).optional(),
}).superRefine((value, context) => {
  if (value.eventType === "conversion" && (value.value === undefined || !value.currency)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Valore e valuta sono obbligatori per una conversione" });
  }
});

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const rate = await checkRateLimit(`commerce-conversion:${requestClientIp(request.headers)}`, 120, 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ success: false, error: "Troppe richieste" }, { status: 429 });
  const keyId = request.headers.get("x-litx-key-id") || "";
  const key = keyId ? await prisma.commerceTrackingKey.findFirst({ where: { id: keyId, active: true } }) : null;
  if (!key) return NextResponse.json({ success: false, error: "Chiave commerce non valida" }, { status: 401 });
  let secret = "";
  try { secret = String((decryptConfigSecrets(JSON.parse(key.config)) as { secret?: string }).secret || ""); }
  catch {}
  if (!secret || !verifyCommerceConversionSignature(rawBody, request.headers.get("x-litx-timestamp"), request.headers.get("x-litx-signature"), secret)) {
    return NextResponse.json({ success: false, error: "Firma commerce non valida o scaduta" }, { status: 401 });
  }
  let body: unknown;
  try { body = JSON.parse(rawBody); }
  catch { return NextResponse.json({ success: false, error: "JSON non valido" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Evento non valido" }, { status: 400 });
  const input = parsed.data;
  const [attribution, product] = await Promise.all([
    resolveCommerceAttribution({ botId: key.botId, conversationId: input.conversationId, sessionId: input.sessionId }),
    input.productExternalId ? prisma.product.findFirst({ where: { botId: key.botId, externalId: input.productExternalId }, select: { id: true } }) : Promise.resolve(null),
  ]);
  if (attribution.status === "rejected") return NextResponse.json({ success: false, error: "Attribuzione conversazione/sessione non valida" }, { status: 400 });
  if (input.productExternalId && !product) return NextResponse.json({ success: false, error: "Prodotto non trovato" }, { status: 400 });
  const variant = input.variantExternalId && product
    ? await prisma.productVariant.findFirst({ where: { productId: product.id, externalId: input.variantExternalId }, select: { id: true } })
    : null;
  if (input.variantExternalId && !variant) return NextResponse.json({ success: false, error: "Variante non trovata" }, { status: 400 });
  const pageUrl = input.pageUrl ? safeHttpsUrl(input.pageUrl) : undefined;
  if (input.pageUrl && !pageUrl) return NextResponse.json({ success: false, error: "URL pagina non sicuro" }, { status: 400 });
  const externalEventId = `${key.id}:${input.externalEventId}`;
  try {
    const event = await prisma.commerceEvent.create({
      data: {
        botId: key.botId,
        conversationId: attribution.conversationId,
        productId: product?.id,
        variantId: variant?.id,
        eventType: input.eventType,
        externalEventId,
        sessionId: attribution.sessionId,
        pageUrl,
        value: input.value,
        currency: input.currency,
        metadata: JSON.stringify({ ...sanitizeCommerceMetadata(input.metadata), verified: true, source: "server", attributionStatus: attribution.status }),
      },
      select: { id: true, eventType: true, createdAt: true },
    });
    return NextResponse.json({ success: true, data: event }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ success: true, duplicate: true });
    throw error;
  }
}
