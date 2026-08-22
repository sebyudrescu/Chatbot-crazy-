---
name: rag-system-developer
description: Develop and verify LitX retrieval, grounding, ingestion, evaluation and vector-search behavior using the current PostgreSQL/Pinecone architecture.
version: 2.0.0
tags: [rag, retrieval, embeddings, evaluation, postgres, pinecone]
author: LitX
---

# LitX RAG System Developer

Use this skill for changes to knowledge ingestion, chunking, embeddings, hybrid retrieval, BM25, reranking, grounding, evaluation and retrieval observability.

## Authoritative architecture

- Next.js 16 and Node.js 24.
- PostgreSQL is the durable database and vector-search fallback.
- Pinecone is optional and must never become the only copy of knowledge.
- Knowledge files are processed without relying on local persistent filesystem storage.
- Retrieval is bot-bound; every query and mutation must preserve `botId` isolation.
- The agentic orchestrator decides semantically when to call knowledge or commerce tools.
- Deterministic code enforces security, privacy, schemas, budgets and grounding.

## Workflow

1. Read the current route/runtime and relevant Next.js 16 documentation.
2. Reproduce the failure with a focused evaluation or contract test.
3. Identify whether the fault belongs to ingestion, extraction, indexing, retrieval, reranking, grounding or answer generation.
4. Make the smallest general fix; do not add global typo or keyword tables for one example.
5. Preserve source IDs, citations, confidence and latency/cost telemetry.
6. Run typecheck, lint, build and the relevant retrieval/evaluation suites.
7. For production claims, verify the exact CI commit, deployment and health endpoint.

## Required invariants

- Never retrieve knowledge from another agent.
- Never invent citations, products, prices, stock or policies.
- A missing or weak source must fail safely or trigger handoff.
- Evaluation runs must not create leads, send webhooks or cause real side effects.
- Uploaded content, prompts, customer messages and credentials must not enter logs or documentation.
- Pinecone failures must retain a PostgreSQL fallback where the product contract requires availability.
- Do not add SQLite, FAISS filesystem indices or Vercel-local upload persistence.

## Relevant modules and tests

Inspect current files instead of relying on a static file list. Typical entry points include:

- `lib/rag-pipeline.ts`
- `lib/database-vector-store.ts`
- `lib/pinecone-vector-store.ts`
- `lib/rag-benchmark.ts`
- `lib/grounding-policy.ts`
- `scripts/test-rag-retrieval.ts`
- `scripts/test-grounding-policy.ts`
- `scripts/test-conversation-quality-benchmark.ts`
- `scripts/benchmark-html-extraction.ts`
