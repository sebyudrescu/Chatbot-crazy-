import { z } from 'zod'

// Enums
export enum SourceType {
  URL = 'url',
  PDF = 'pdf',
  DOCX = 'docx',
  TXT = 'txt',
  CSV = 'csv',
  MANUAL = 'manual',
}

export enum SourceStatus {
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
}

// Zod Schemas for validation
export const ChatbotSettingsSchema = z.object({
  primaryColor: z.string().optional(),
  botName: z.string().optional(),
  welcomeMessage: z.string().optional(),
  role: z.string().max(1000).optional(),
  objective: z.string().max(2000).optional(),
  rules: z.array(z.string().max(1000)).max(30).optional(),
  language: z.string().max(80).optional(),
  tone: z.string().max(80).optional(),
  responseLength: z.enum(['short', 'balanced', 'detailed']).optional(),
  fallbackMessage: z.string().max(1000).optional(),
  aiModel: z.string().max(100).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(64).max(4096).optional(),
})

export const CreateChatbotSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  settings: ChatbotSettingsSchema.optional(),
  promptTemplateId: z.string().nullable().optional(),
  systemPrompt: z.string().nullable().optional(),
  promptVariables: z.record(z.string()).optional(),
})

export const UpdateChatbotSchema = z.object({
  companyName: z.string().min(1).optional(),
  settings: ChatbotSettingsSchema.optional(),
  isActive: z.boolean().optional(),
  promptTemplateId: z.string().nullable().optional(),
  systemPrompt: z.string().nullable().optional(),
  promptVariables: z.record(z.string()).optional(),
  trialEndDate: z.string().datetime().optional(),
})

export const CreateKnowledgeSourceSchema = z.object({
  botId: z.string().uuid(),
  sourceType: z.nativeEnum(SourceType),
  sourceUrl: z.string().url().optional(),
  originalFilename: z.string().optional(),
  contentText: z.string().min(1),
})

export const CreateConversationSchema = z.object({
  botId: z.string().uuid(),
  userSessionId: z.string().min(1),
})

export const CreateMessageSchema = z.object({
  conversationId: z.string().uuid(),
  role: z.nativeEnum(MessageRole),
  content: z.string().min(1),
  sourcesUsed: z.array(z.any()).optional(),
})

// TypeScript Types
export type ChatbotSettings = z.infer<typeof ChatbotSettingsSchema>
export type CreateChatbotInput = z.infer<typeof CreateChatbotSchema>
export type CreateKnowledgeSourceInput = z.infer<typeof CreateKnowledgeSourceSchema>
export type CreateConversationInput = z.infer<typeof CreateConversationSchema>
export type CreateMessageInput = z.infer<typeof CreateMessageSchema>

export interface SourceUsed {
  sourceId: string
  sourceType: string
  relevanceScore: number
  contentSnippet?: string
}
