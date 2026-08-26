import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getMetaConnectionForBot } from "@/lib/meta-connections";
import { listWhatsAppTemplates, sendWhatsAppTemplate } from "@/lib/meta-messaging";
import { renderWhatsAppTemplate, templateBody, templateHasUnsupportedVariables, templateParameterCount } from "@/lib/meta-payloads";
import { stringifyJSON } from "@/lib/utils";
import { recordHelpDeskOperatorReply } from "@/lib/helpdesk-operations";
import { dashboardAuthErrorResponse, requireBotPermission, requireDashboardActor, requireResourcePermission } from "@/lib/workspace-auth";

const SendSchema = z.object({
  conversationId: z.string().uuid(),
  templateName: z.string().min(1).max(512),
  language: z.string().min(2).max(20),
  parameters: z.array(z.string().trim().min(1).max(1024)).max(10).default([]),
});

export async function GET(request: NextRequest) {
  try {
    const botId = z.string().uuid().parse(request.nextUrl.searchParams.get("botId"));
    const actor = await requireDashboardActor(request);
    await requireBotPermission(actor, botId, "conversation.read");
    const found = await getMetaConnectionForBot(botId, "whatsapp");
    if (!found) return NextResponse.json({ success: false, error: "WhatsApp non collegato" }, { status: 409 });
    const templates = await listWhatsAppTemplates(found.config);
    return NextResponse.json({ success: true, data: templates.map(template => ({
      id: template.id,
      name: template.name,
      language: template.language,
      category: template.category,
      body: templateBody(template),
      parameterCount: templateParameterCount(template),
      supported: !templateHasUnsupportedVariables(template),
    })) });
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Lettura template non riuscita" }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = SendSchema.parse(await request.json());
    const actor = await requireDashboardActor(request);
    await requireResourcePermission(actor, "conversation", input.conversationId, "conversation.write");
    const conversation = await prisma.conversation.findUnique({ where: { id: input.conversationId } });
    if (!conversation || conversation.channel !== "whatsapp" || !conversation.externalThreadId) {
      return NextResponse.json({ success: false, error: "Conversazione WhatsApp non valida" }, { status: 409 });
    }
    const found = await getMetaConnectionForBot(conversation.botId, "whatsapp");
    if (!found) return NextResponse.json({ success: false, error: "WhatsApp non collegato" }, { status: 409 });
    const templates = await listWhatsAppTemplates(found.config);
    const template = templates.find(item => item.name === input.templateName && item.language === input.language);
    if (!template) return NextResponse.json({ success: false, error: "Template approvato non trovato" }, { status: 404 });
    if (templateHasUnsupportedVariables(template)) return NextResponse.json({ success: false, error: "Il template contiene variabili nell'intestazione o nei pulsanti non ancora supportate" }, { status: 409 });
    const expected = templateParameterCount(template);
    if (input.parameters.length !== expected) return NextResponse.json({ success: false, error: `Il template richiede ${expected} valori` }, { status: 400 });

    const content = renderWhatsAppTemplate(template, input.parameters);
    const message = await prisma.message.create({ data: {
      conversationId: conversation.id,
      role: "assistant",
      content,
      channel: "whatsapp",
      deliveryStatus: "pending",
      operatorAuthored: true,
      sourcesUsed: stringifyJSON({ type: "whatsapp_template", name: template.name, language: template.language }),
    } });
    try {
      await sendWhatsAppTemplate({ config: found.config, recipientId: conversation.externalThreadId, name: template.name, language: template.language, parameters: input.parameters, messageId: message.id });
    } catch (error) {
      return NextResponse.json({ success: false, code: "CHANNEL_DELIVERY_FAILED", error: error instanceof Error ? error.message : "Invio template non riuscito", data: { ...message, deliveryStatus: "failed" } }, { status: 502 });
    }
    await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
    await recordHelpDeskOperatorReply({ botId: conversation.botId, conversationId: conversation.id, at: message.createdAt });
    return NextResponse.json({ success: true, data: { ...message, deliveryStatus: "sent" } }, { status: 201 });
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Invio template non riuscito" }, { status: 400 });
  }
}
