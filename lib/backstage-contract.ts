import { z } from "zod";
import { ActionFieldsSchema, validateActionDefinition } from "./action-schema";
import { WorkflowFieldsSchema, validateWorkflowDefinition } from "./workflow-schema";
import { assertSafeRemoteUrl } from "./url-safety";

export const BackstageDraftTypeSchema = z.enum([
  "action",
  "workflow",
  "prompt",
  "knowledge_url",
  "evaluations",
]);

const SettingsPatchSchema = z.object({
  role: z.string().trim().min(1).max(500).optional(),
  objective: z.string().trim().min(1).max(1000).optional(),
  language: z.string().trim().min(1).max(80).optional(),
  tone: z.string().trim().min(1).max(160).optional(),
  responseLength: z.enum(["concise", "balanced", "detailed"]).optional(),
  welcomeMessage: z.string().trim().min(1).max(500).optional(),
  fallbackMessage: z.string().trim().min(1).max(500).optional(),
  handoffMessage: z.string().trim().min(1).max(500).optional(),
  temperature: z.number().min(0).max(1).optional(),
  maxTokens: z.number().int().min(128).max(4096).optional(),
}).strict();

const EvaluationDraftSchema = z.object({
  cases: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    question: z.string().trim().min(1).max(2000),
    expectedKeywords: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
    forbiddenKeywords: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
    minimumConfidence: z.number().min(0).max(1).default(0.5),
  })).min(1).max(20),
});

const PromptDraftSchema = z.object({
  systemPrompt: z.string().trim().min(80).max(30000).optional(),
  settingsPatch: SettingsPatchSchema.optional(),
}).refine(value => value.systemPrompt || (value.settingsPatch && Object.keys(value.settingsPatch).length), {
  message: "La bozza deve modificare il prompt o almeno un'impostazione consentita",
});

export async function validateBackstagePayload(type: z.infer<typeof BackstageDraftTypeSchema>, payload: unknown, botId: string) {
  if (type === "action") {
    const targetId = z.object({ targetId: z.string().uuid().optional() }).passthrough().parse(payload).targetId;
    const parsed = ActionFieldsSchema.parse({ ...(payload as object), botId, enabled: false });
    validateActionDefinition(parsed);
    return { ...parsed, botId: undefined, enabled: false, targetId };
  }
  if (type === "workflow") {
    const targetId = z.object({ targetId: z.string().uuid().optional() }).passthrough().parse(payload).targetId;
    const parsed = WorkflowFieldsSchema.parse({ ...(payload as object), botId, isActive: false });
    validateWorkflowDefinition(parsed);
    return { ...parsed, botId: undefined, isActive: false, targetId };
  }
  if (type === "prompt") return PromptDraftSchema.parse(payload);
  if (type === "evaluations") return EvaluationDraftSchema.parse(payload);
  const parsed = z.object({ url: z.string().trim().min(1).max(2048), crawlSite: z.boolean().default(false) }).parse(payload);
  const safeUrl = await assertSafeRemoteUrl(parsed.url);
  return { ...parsed, url: safeUrl.toString() };
}

export const BackstageChatSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().trim().min(1).max(6000),
});

export const BackstageSessionCreateSchema = z.object({
  botId: z.string().uuid(),
  title: z.string().trim().min(1).max(120).optional(),
});

export type BackstageDraftType = z.infer<typeof BackstageDraftTypeSchema>;
