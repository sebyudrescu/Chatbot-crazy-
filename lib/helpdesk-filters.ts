import { z } from "zod";

export const HelpDeskSavedViewFiltersSchema = z.object({
  botId: z.string().uuid().nullable().optional(),
  status: z.enum(["all", "open", "handoff", "resolved"]).default("all"),
  priority: z.enum(["all", "low", "normal", "high", "urgent"]).default("all"),
  channel: z.string().trim().min(1).max(40).default("all"),
  assignment: z.enum(["all", "assigned", "unassigned"]).default("all"),
  sla: z.enum(["all", "healthy", "due_soon", "breached", "untracked"]).default("all"),
}).strict();

export const HelpDeskSavedViewSortSchema = z.enum(["recent", "oldest"]);

export const CreateHelpDeskSavedViewSchema = z.object({
  name: z.string().trim().min(1).max(80),
  filters: HelpDeskSavedViewFiltersSchema,
  sort: HelpDeskSavedViewSortSchema.default("recent"),
  isDefault: z.boolean().default(false),
}).strict();

export const UpdateHelpDeskSavedViewSchema = CreateHelpDeskSavedViewSchema.partial().strict();

export type HelpDeskSavedViewFilters = z.infer<typeof HelpDeskSavedViewFiltersSchema>;

export function parseHelpDeskSavedViewFilters(value: string) {
  try {
    return HelpDeskSavedViewFiltersSchema.parse(JSON.parse(value));
  } catch {
    return HelpDeskSavedViewFiltersSchema.parse({});
  }
}
