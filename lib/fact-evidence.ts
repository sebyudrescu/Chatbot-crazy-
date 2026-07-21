export interface FactEvidenceInput {
  rawText: string;
}

export function hasUserEvidence(
  fact: FactEvidenceInput,
  messages: Array<{ role: string; content: string }>,
) {
  const evidence = normalizeEvidence(fact.rawText);
  if (evidence.length < 3) return false;
  return messages
    .filter((message) => message.role.toLowerCase() === "user")
    .some((message) => normalizeEvidence(message.content).includes(evidence));
}

function normalizeEvidence(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("it-IT")
    .replace(/[^\p{L}\p{N}@.+]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
