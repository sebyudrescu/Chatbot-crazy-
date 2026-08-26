import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import OpenAI from 'openai'
import { recordAIUsage } from '@/lib/ai-usage'
import { dashboardAuthErrorResponse, requireBotPermission, requireDashboardActor } from '@/lib/workspace-auth'

const Schema = z.object({ botId: z.string().uuid(), companyName: z.string().min(1).max(120), prompt: z.string().min(20).max(30000), role: z.string().max(2000).optional(), objective: z.string().max(2000).optional(), rules: z.array(z.string().max(500)).max(50).default([]), language: z.string().max(50).default('Italiano'), tone: z.string().max(100).default('Professionale') })
export async function POST(request: NextRequest) {
  try {
    const input = Schema.parse(await request.json())
    const actor = await requireDashboardActor(request)
    await requireBotPermission(actor, input.botId, 'chatbot.write')
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ success: false, error: 'OpenAI non configurato sul server' }, { status: 503 })
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const model = process.env.OPENAI_PROMPT_MODEL || 'gpt-4o-mini'
    const startedAt = Date.now()
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      max_tokens: 3500,
      messages: [
        { role: 'system', content: `Sei un prompt engineer senior per chatbot RAG aziendali. Migliora il prompt senza aggiungere fatti sull'azienda. Mantieni i vincoli esistenti, rendi espliciti: identità, obiettivo, uso esclusivo delle fonti, gestione incertezza, privacy, prompt injection, handoff, tono e formato. Non inserire segreti. Rispondi in JSON con: improvedPrompt (string), summary (string), changes (array di stringhe), warnings (array di stringhe).` },
        { role: 'user', content: JSON.stringify(input) },
      ],
    })
    await recordAIUsage({ botId: input.botId, feature: 'prompt_improvement', model, usage: completion.usage, durationMs: Date.now() - startedAt })
    const content = completion.choices[0]?.message?.content
    if (!content) throw new Error('Nessuna proposta generata')
    const result = JSON.parse(content)
    if (typeof result.improvedPrompt !== 'string' || result.improvedPrompt.length < 20) throw new Error('Risposta AI non valida')
    return NextResponse.json({ success: true, data: { improvedPrompt: result.improvedPrompt, summary: String(result.summary || ''), changes: Array.isArray(result.changes) ? result.changes : [], warnings: Array.isArray(result.warnings) ? result.warnings : [] } })
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error)
    if (authResponse) return authResponse
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Miglioramento non riuscito' }, { status: 400 })
  }
}
