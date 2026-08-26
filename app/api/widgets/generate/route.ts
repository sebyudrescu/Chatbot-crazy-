import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { recordAIUsage } from "@/lib/ai-usage";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai-models";
import { checkRateLimit, requestClientIp } from "@/lib/rate-limit";
import { dashboardAuthErrorResponse, requireBotPermission, requireDashboardActor } from "@/lib/workspace-auth";
import {
  WidgetDefinitionSchema,
  widgetDefinitionDiff,
} from "@/lib/widget-definition";

const TemplateSchema = z.enum([
  "product_carousel",
  "lead_capture",
  "appointment",
  "order_tracking",
]);

const InputSchema = z.object({
  botId: z.string().uuid(),
  prompt: z.string().trim().min(12).max(3000),
  currentTemplate: TemplateSchema.optional(),
  currentDefinition: WidgetDefinitionSchema.optional(),
});

const GeneratedSchema = z.object({
  template: TemplateSchema,
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().min(5).max(500),
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(5).max(500),
  label: z.string().trim().min(2).max(80),
  triggerKeywords: z.array(z.string().trim().min(2).max(80)).min(2).max(12),
  definition: WidgetDefinitionSchema,
});

export async function POST(request: NextRequest) {
  try {
    const input = InputSchema.parse(await request.json());
    const actor = await requireDashboardActor(request);
    await requireBotPermission(actor, input.botId, "chatbot.write");
    const rate = await checkRateLimit(
      `widget-ai-builder:${input.botId}:${requestClientIp(request.headers)}`,
      12,
      60 * 60 * 1000,
    );
    if (!rate.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Limite AI Builder raggiunto. Riprova più tardi.",
        },
        { status: 429 },
      );
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { success: false, error: "OpenAI non configurato sul server" },
        { status: 503 },
      );
    }

    const model = process.env.OPENAI_WIDGET_MODEL || DEFAULT_CHAT_MODEL;
    const startedAt = Date.now();
    const completion = await new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    }).chat.completions.create({
      model,
      temperature: 0.15,
      response_format: { type: "json_object" },
      max_tokens: 3500,
      messages: [
        {
          role: "system",
          content: [
            "Sei il builder sicuro di widget dichiarativi LitX.",
            "Non generare codice, HTML, JavaScript, URL, segreti o fatti aziendali.",
            "Scegli esclusivamente uno dei template: product_carousel, lead_capture, appointment, order_tracking.",
            "Restituisci JSON con template, name, description, title, body, label, triggerKeywords e definition completa.",
            "definition deve rispettare la DSL LitX versione 1: template, schema, defaults, root, functions e states.",
            "Componenti consentiti: card, stack, row, title, text, image, badge, button, input, checkbox, product_carousel, lead_form, appointment, order_tracking.",
            "Funzioni consentite: open_link, send_message, dismiss, set_variables, client_event. Non generare server_action o segreti.",
            "Ogni functionId deve riferirsi a una funzione esistente; usa un solo stato initiale.",
            "Le triggerKeywords devono essere frasi brevi e concrete nella lingua dell'utente.",
            "Per i prodotti non promettere disponibilità o prezzi: saranno inseriti dal catalogo verificato.",
          ].join(" "),
        },
        { role: "user", content: JSON.stringify(input) },
      ],
    });
    await recordAIUsage({
      botId: input.botId,
      feature: "widget_ai_builder",
      model,
      usage: completion.usage,
      durationMs: Date.now() - startedAt,
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Nessuna proposta generata");
    const data = GeneratedSchema.parse(JSON.parse(content));
    const definition = WidgetDefinitionSchema.parse(data.definition);
    if (definition.template !== data.template) throw new Error("Template proposta incoerente");
    if (definition.functions.some((fn) => fn.type === "server_action")) {
      throw new Error("La proposta AI non può creare server action");
    }
    return NextResponse.json({
      success: true,
      data: {
        ...data,
        definition,
        diff: widgetDefinitionDiff(input.currentDefinition || null, definition),
      },
    });
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Generazione non riuscita",
      },
      { status: 400 },
    );
  }
}
