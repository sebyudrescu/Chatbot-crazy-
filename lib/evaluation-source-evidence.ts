import { z } from 'zod';

export const sourceEvidenceSchema = z.object({
  sourceId: z.string().uuid(),
  chunkId: z.string().uuid(),
  quote: z.string().trim().min(20).max(1500),
});
export type SourceEvidence = z.infer<typeof sourceEvidenceSchema>;
export const sourceDraftSchema = z.object({
  name: z.string().trim().min(1).max(120),
  question: z.string().trim().min(1).max(2000),
  expectedKeywords: z.array(z.string().trim().min(1).max(100)).min(1).max(5),
  chunkId: z.string().uuid(),
  quote: z.string().trim().min(20).max(1500),
});

// Whitespace may change during extraction; no fuzzy match may fabricate a citation.
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
export function matchesSourceEvidence(text: string, quote: string, keywords: string[]) {
  const evidence = normalize(quote);
  return evidence.length >= 20 && normalize(text).includes(evidence)
    && keywords.length > 0 && keywords.every(word => evidence.toLocaleLowerCase('it').includes(normalize(word).toLocaleLowerCase('it')));
}
