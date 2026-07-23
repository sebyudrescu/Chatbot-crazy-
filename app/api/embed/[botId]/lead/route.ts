import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isAllowedWidgetOrigin } from "@/lib/widget-origin";
import { checkRateLimit, requestClientIp } from "@/lib/rate-limit";
import { syncCRMContactFromConversation } from "@/lib/crm-sync";
import { emitIntegrationWebhook } from "@/lib/integration-webhooks";
import { readWidgetSession, widgetSessionToken } from "@/lib/widget-session";

const LeadSchema = z
  .object({
    conversationId: z.string().uuid(),
    userSessionId: z.string().min(1).max(300),
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(254).optional().or(z.literal("")),
    phone: z.string().trim().min(7).max(40).optional().or(z.literal("")),
    company: z.string().trim().max(120).optional().or(z.literal("")),
    consent: z.literal(true),
  })
  .refine((value) => Boolean(value.email || value.phone), {
    message: "Inserisci email o telefono",
  });

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ botId: string }> },
) {
  const { botId } = await props.params;
  const parsedBotId = z.string().uuid().safeParse(botId);
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }
  const parsed = LeadSchema.safeParse(payload);
  if (!parsedBotId.success || !parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.success
          ? "Richiesta non valida"
          : parsed.error.issues[0]?.message || "Dati contatto non validi",
      },
      { status: 400 },
    );
  }
  if (!request.headers.get("origin") && process.env.NODE_ENV === "production") {
    return NextResponse.json({ success: false, error: "origin_required" }, { status: 403 });
  }

  if (
    !(await isAllowedWidgetOrigin(
      botId,
      request.headers.get("origin"),
      request.nextUrl.origin,
    ))
  ) {
    return NextResponse.json(
      { success: false, error: "origin_not_allowed" },
      { status: 403 },
    );
  }
  try {
    readWidgetSession(
      widgetSessionToken(request),
      botId,
      parsed.data.userSessionId,
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "widget_session_invalid" },
      { status: 401 },
    );
  }
  const rate = await checkRateLimit(
    `widget-lead:${botId}:${requestClientIp(request.headers)}`,
    10,
    60 * 1000,
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { success: false, error: "rate_limit_exceeded" },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000)),
          ),
        },
      },
    );
  }

  const updated = await prisma.conversation.updateMany({
    where: {
      id: parsed.data.conversationId,
      botId,
      userSessionId: parsed.data.userSessionId,
    },
    data: {
      userName: parsed.data.name,
      userEmail: parsed.data.email || null,
      userPhone: parsed.data.phone || null,
      userCompany: parsed.data.company || null,
      lastMessageAt: new Date(),
    },
  });
  if (!updated.count) {
    return NextResponse.json(
      { success: false, error: "Conversazione non trovata" },
      { status: 404 },
    );
  }
  const contact = await syncCRMContactFromConversation(
    parsed.data.conversationId,
    { consentStatus: "granted" },
  );
  after(async () => {
    await emitIntegrationWebhook({
      botId,
      event: "lead.captured",
      idempotencyKey: `widget-lead:${contact.id}:${contact.updatedAt.toISOString()}`,
      payload: {
        contactId: contact.id,
        conversationId: parsed.data.conversationId,
        name: parsed.data.name,
        email: parsed.data.email || null,
        phone: parsed.data.phone || null,
        company: parsed.data.company || null,
        consent: true,
      },
    });
  });
  return NextResponse.json({
    success: true,
    data: { contactId: contact.id, leadScore: contact.leadScore },
  });
}
