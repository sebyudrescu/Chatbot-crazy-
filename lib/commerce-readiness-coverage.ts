import { conversationQualityContractSchema } from "./conversation-quality-benchmark";
import { hasProductionConversationQualityMetrics } from "./readiness-metrics";

export type CommerceCoverageDimension = "discovery" | "product_follow_up" | "knowledge_boundary";

export interface CommerceEvaluationEvidence {
  conversationTurns: string;
  qualityContract: string | null;
  latestRun?: {
    passed: boolean;
    createdAt: Date;
    metrics: string | null;
  };
}

export interface CommerceEvaluationCoverage {
  complete: boolean;
  covered: Record<CommerceCoverageDimension, boolean>;
  missing: CommerceCoverageDimension[];
}

const dimensions: CommerceCoverageDimension[] = ["discovery", "product_follow_up", "knowledge_boundary"];

export function assessCommerceEvaluationCoverage(
  cases: CommerceEvaluationEvidence[],
  verificationChangedAt: Date | null,
): CommerceEvaluationCoverage {
  const covered: Record<CommerceCoverageDimension, boolean> = {
    discovery: false,
    product_follow_up: false,
    knowledge_boundary: false,
  };

  for (const test of cases) {
    const run = test.latestRun;
    if (!run?.passed || (verificationChangedAt && run.createdAt < verificationChangedAt)) continue;
    if (!hasProductionConversationQualityMetrics(run.metrics)) continue;
    const turns = parseTurns(test.conversationTurns);
    if (turns.length === 0) continue;
    const contract = parseContract(test.qualityContract);
    if (!contract) continue;

    const expectedTools = new Set(contract.expectedTools.map(normalize));
    const forbiddenTools = new Set(contract.forbiddenTools.map(normalize));
    const hasMemoryExpectation = Object.keys(contract.expectedMemory).length > 0;

    if (expectedTools.has("search_products") && contract.cardPolicy === "required" && hasMemoryExpectation) {
      covered.discovery = true;
    }
    if (
      (expectedTools.has("get_product") || expectedTools.has("check_inventory")) &&
      contract.cardPolicy === "forbidden" &&
      hasMemoryExpectation
    ) {
      covered.product_follow_up = true;
    }
    if (
      expectedTools.has("search_knowledge_base") &&
      forbiddenTools.has("search_products") &&
      contract.cardPolicy === "forbidden"
    ) {
      covered.knowledge_boundary = true;
    }
  }

  const missing = dimensions.filter(dimension => !covered[dimension]);
  return { complete: missing.length === 0, covered, missing };
}

function parseTurns(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(turn => typeof turn === "string" && turn.trim()) : [];
  } catch {
    return [];
  }
}

function parseContract(value: string | null) {
  if (!value) return null;
  try {
    return conversationQualityContractSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("it");
}
