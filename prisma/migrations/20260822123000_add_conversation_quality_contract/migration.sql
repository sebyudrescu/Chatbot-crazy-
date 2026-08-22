ALTER TABLE "evaluation_cases"
ADD COLUMN "conversationTurns" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN "qualityContract" TEXT;
