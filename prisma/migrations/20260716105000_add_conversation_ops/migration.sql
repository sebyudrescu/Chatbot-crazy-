ALTER TABLE "conversations"
ADD COLUMN "internalNotes" TEXT,
ADD COLUMN "tags" TEXT NOT NULL DEFAULT '[]';
