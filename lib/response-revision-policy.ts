import { z } from "zod";

const KeywordSchema = z.string().trim().min(2).max(100);

export const RevisionDraftSchema = z.object({
  question: z.string().trim().min(3).max(2_000).optional(),
  revisedAnswer: z.string().trim().min(10).max(5_000),
  rationale: z.string().trim().max(1_000).nullable().optional(),
  expectedKeywords: z.array(KeywordSchema).max(12).optional(),
  forbiddenKeywords: z.array(KeywordSchema).max(12).default([]),
});

export const RevisionUpdateSchema = RevisionDraftSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "Nessuna modifica indicata",
);

const sensitiveValue = /(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:Bearer\s+)?(?:sk|shpat|shpca|shpss)_[A-Za-z0-9_-]{10,}\b|\b(?:\d[ -]?){13,19}\b|\+?\d(?:[ .()-]?\d){8,})/i;

const stopwords = new Set([
  "abbiamo", "avete", "avere", "essere", "sono", "siamo", "siete", "della",
  "delle", "degli", "dello", "dalla", "dalle", "dallo", "nella", "nelle",
  "nello", "questo", "questa", "quello", "quella", "anche", "come", "cosa",
  "quando", "perche", "perché", "quindi", "oppure", "solo", "molto", "puoi",
  "posso", "potete", "deve", "devi", "viene", "vengono", "fare", "fatto",
  "with", "that", "this", "from", "your", "have", "does", "will", "about",
]);

export function uniqueRevisionKeywords(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 12);
}

export function deriveRevisionKeywords(answer: string) {
  const counts = new Map<string, number>();
  for (const token of answer.toLocaleLowerCase("it").match(/[\p{L}\p{N}][\p{L}\p{N}'’-]{3,}/gu) || []) {
    if (stopwords.has(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length)
    .slice(0, 5)
    .map(([keyword]) => keyword);
}

export function assertRevisionHasNoSensitiveData(question: string, answer: string) {
  if (sensitiveValue.test(`${question}\n${answer}`)) {
    throw new Error("Rimuovi email, telefono, dati di pagamento o segreti prima di salvare questa Q&A nella knowledge base.");
  }
}
