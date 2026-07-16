CREATE TABLE IF NOT EXISTS "evaluation_cases" (
  "id" TEXT NOT NULL,"botId" TEXT NOT NULL,"name" TEXT NOT NULL,"question" TEXT NOT NULL,
  "expectedKeywords" TEXT NOT NULL DEFAULT '[]',"forbiddenKeywords" TEXT NOT NULL DEFAULT '[]',
  "minimumConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,"isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "evaluation_cases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "evaluation_cases_botId_fkey" FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "evaluation_cases_botId_idx" ON "evaluation_cases"("botId");
CREATE INDEX IF NOT EXISTS "evaluation_cases_isActive_idx" ON "evaluation_cases"("isActive");
CREATE TABLE IF NOT EXISTS "evaluation_runs" (
  "id" TEXT NOT NULL,"caseId" TEXT NOT NULL,"passed" BOOLEAN NOT NULL,"response" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION,"latencyMs" INTEGER,"failureReason" TEXT,"conversationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evaluation_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "evaluation_runs_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "evaluation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "evaluation_runs_caseId_createdAt_idx" ON "evaluation_runs"("caseId","createdAt");
CREATE INDEX IF NOT EXISTS "evaluation_runs_passed_idx" ON "evaluation_runs"("passed");
