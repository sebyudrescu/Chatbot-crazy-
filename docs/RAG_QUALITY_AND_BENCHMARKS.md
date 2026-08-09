# RAG quality, calibration and extraction benchmarks

LitX measures retrieval and answer quality per chatbot instead of assuming that one threshold works for every business.

## Automatic evaluation

The Evaluations page runs each active case through the real chat endpoint and then judges:

- Precision@5
- Recall@5
- Mean Reciprocal Rank (MRR)
- nDCG@5
- Faithfulness to retrieved evidence
- Answer accuracy
- Overall correct-answer/pass rate
- End-to-end latency

The judge retrieves a pool of 20 candidates, labels which candidates contain evidence, and evaluates the top five against that pool. Metrics are persisted on each evaluation run. If the evaluation model is unavailable, LitX uses a conservative deterministic fallback instead of failing the regression suite.

After at least five measured runs, LitX calibrates `retrievalMinScore` and `groundingThreshold` for that chatbot. Calibration penalizes false-positive answers more strongly than cautious fallbacks. The owner can still inspect and adjust both values in the agent settings.

## Retrieval pipeline

1. Semantic candidates from the persistent vector corpus.
2. True BM25 over the full persistent text corpus.
3. Reciprocal Rank Fusion.
4. Conversation-aware local reranking.
5. Deduplication.
6. Optional multilingual cross-encoder reranking through Jina, with an eight-second timeout and local fallback.

Set `JINA_API_KEY` to use the cross-encoder and enable it only on the intended chatbot. `JINA_RERANK_MODEL` defaults to `jina-reranker-v2-base-multilingual`.

## Authorized live web search

Live search is disabled by default. When enabled for a chatbot, it requires at least one allowlisted hostname and uses Firecrawl `includeDomains`. LitX validates the allowlist before the request and validates every returned URL again. Live results are transient, never added automatically to the permanent knowledge base, and the response prompt requires Markdown citations to the exact source URL.

## Pipeline telemetry

The Analytics page aggregates durable stage events for crawl, cleaning, embedding, retrieval, reranking, live web search and generation. It reports calls, average latency, success rate, tokens and estimated AI cost. AI prices remain configuration estimates; provider invoices are authoritative.

## HTML extraction benchmark

Run:

```powershell
npm run benchmark:html-extraction -- https://example.com/page expected term
```

The harness compares LitX/Cheerio, Mozilla Readability, Trafilatura and Firecrawl when available. It scores expected-term coverage, content volume, sentence structure, boilerplate noise and duplicate lines; equal-quality outputs are ranked by latency. Trafilatura is a local benchmark dependency and is not required by the Vercel runtime. Firecrawl is included when `FIRECRAWL_API_KEY` is present.

Example verified on the Wikipedia RAG article on 9 August 2026: LitX, Readability and Trafilatura all reached full content-quality coverage; Readability was the fastest of the equal-quality outputs. This is one page, not a universal winner. Run the benchmark on representative pages from each client before selecting a preferred crawler/extractor strategy.

## Verification

```powershell
npm run test:rag-retrieval
npm run test:quality
npm run typecheck
npm run lint
```
