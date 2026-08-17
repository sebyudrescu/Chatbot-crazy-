ALTER TABLE "embed_settings"
  ADD COLUMN "secondaryColor" TEXT NOT NULL DEFAULT '#825cff',
  ADD COLUMN "launcherColor" TEXT NOT NULL DEFAULT '#633cff',
  ADD COLUMN "brandLogoUrl" TEXT,
  ADD COLUMN "launcherMessageEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "launcherMessage" TEXT,
  ADD COLUMN "launcherMessageDelay" INTEGER NOT NULL DEFAULT 1500,
  ADD COLUMN "launcherMessageDuration" INTEGER NOT NULL DEFAULT 12000;
