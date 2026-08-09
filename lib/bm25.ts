export interface Bm25Document {
  id: string;
  text: string;
}

export interface Bm25Result<T extends Bm25Document> {
  document: T;
  score: number;
  rawScore: number;
}

export interface Bm25Options {
  k1?: number;
  b?: number;
  topK?: number;
}

const TOKEN_PATTERN = /[\p{L}\p{N}]+/gu;
const STOP_WORDS = new Set([
  "a", "ad", "al", "alla", "alle", "anche", "che", "chi", "con", "come", "da", "dal",
  "dalla", "delle", "di", "e", "effettuare", "gli", "il", "in", "la", "le", "lo", "mi",
  "nel", "nella", "non", "o", "per", "piu", "puoi", "quale", "quali", "sono", "su", "un",
  "una", "uno", "the", "a", "an", "and", "are", "for", "from", "how", "in", "is", "of",
  "on", "or", "the", "to", "what", "which", "with",
]);

const QUERY_SYNONYMS: Record<string, string[]> = {
  reso: ["recesso", "restituzione", "restituire"],
  resi: ["recesso", "restituzione", "restituzioni", "restituire"],
  recesso: ["reso", "resi", "restituzione"],
  restituzione: ["reso", "resi", "recesso"],
  spedizione: ["consegna", "corriere"],
  consegna: ["spedizione", "corriere"],
  pagamento: ["pagare", "pagamenti"],
  pagamenti: ["pagare", "pagamento"],
};

export function tokenizeForRetrieval(value: string): string[] {
  return (value.normalize("NFKC").toLocaleLowerCase("it").match(TOKEN_PATTERN) || [])
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

export function tokenizeRetrievalQuery(value: string): string[] {
  const tokens = tokenizeForRetrieval(value);
  return [...new Set(tokens.flatMap((token) => [token, ...(QUERY_SYNONYMS[token] || [])]))];
}

export function rankBm25<T extends Bm25Document>(
  query: string,
  documents: T[],
  options: Bm25Options = {},
): Bm25Result<T>[] {
  const { k1 = 1.2, b = 0.75, topK = documents.length } = options;
  const queryTerms = tokenizeRetrievalQuery(query);
  if (!queryTerms.length || !documents.length || topK <= 0) return [];

  const corpus = documents.map((document) => ({
    document,
    tokens: tokenizeForRetrieval(document.text),
  }));
  const averageLength = corpus.reduce((sum, item) => sum + item.tokens.length, 0) / corpus.length || 1;
  const documentFrequency = new Map<string, number>();

  for (const item of corpus) {
    const present = new Set(item.tokens);
    for (const term of queryTerms) {
      if (present.has(term)) documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    }
  }

  const ranked = corpus.map(({ document, tokens }) => {
    const frequencies = new Map<string, number>();
    for (const token of tokens) frequencies.set(token, (frequencies.get(token) || 0) + 1);

    let rawScore = 0;
    for (const term of queryTerms) {
      const frequency = frequencies.get(term) || 0;
      if (!frequency) continue;
      const frequencyInCorpus = documentFrequency.get(term) || 0;
      const inverseDocumentFrequency = Math.log(
        1 + (documents.length - frequencyInCorpus + 0.5) / (frequencyInCorpus + 0.5),
      );
      const lengthNormalization = frequency + k1 * (1 - b + b * (tokens.length / averageLength));
      rawScore += inverseDocumentFrequency * ((frequency * (k1 + 1)) / lengthNormalization);
    }
    return { document, rawScore };
  }).filter((result) => result.rawScore > 0)
    .sort((left, right) => right.rawScore - left.rawScore);

  const highestScore = ranked[0]?.rawScore || 1;
  return ranked.slice(0, topK).map((result) => ({
    ...result,
    score: result.rawScore / highestScore,
  }));
}
