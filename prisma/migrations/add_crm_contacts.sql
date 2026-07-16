CREATE TABLE IF NOT EXISTS "crm_contacts" (
  "id" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "identityKey" TEXT NOT NULL,
  "name" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "company" TEXT,
  "source" TEXT NOT NULL DEFAULT 'chat',
  "stage" TEXT NOT NULL DEFAULT 'new',
  "leadScore" INTEGER NOT NULL DEFAULT 10,
  "potentialValue" DOUBLE PRECISION,
  "tags" TEXT NOT NULL DEFAULT '[]',
  "notes" TEXT NOT NULL DEFAULT '[]',
  "consentStatus" TEXT NOT NULL DEFAULT 'unknown',
  "lastConversationId" TEXT,
  "lastInteraction" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_contacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "crm_contacts_botId_fkey" FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_contacts_botId_identityKey_key" ON "crm_contacts"("botId", "identityKey");
CREATE INDEX IF NOT EXISTS "crm_contacts_botId_stage_idx" ON "crm_contacts"("botId", "stage");
CREATE INDEX IF NOT EXISTS "crm_contacts_email_idx" ON "crm_contacts"("email");
CREATE INDEX IF NOT EXISTS "crm_contacts_phone_idx" ON "crm_contacts"("phone");
CREATE INDEX IF NOT EXISTS "crm_contacts_leadScore_idx" ON "crm_contacts"("leadScore");
