-- CreateTable
CREATE TABLE "embed_settings" (
    "id" TEXT NOT NULL,
    "chatbot_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT,
    "subtitle" TEXT,
    "theme" TEXT NOT NULL DEFAULT 'light',
    "position" TEXT NOT NULL DEFAULT 'bottom-right',
    "primary_color" TEXT NOT NULL DEFAULT '#007bff',
    "auto_open" BOOLEAN NOT NULL DEFAULT false,
    "show_launcher" BOOLEAN NOT NULL DEFAULT true,
    "custom_css" TEXT,
    "allowed_domains" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "embed_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "embed_settings_chatbot_id_key" ON "embed_settings"("chatbot_id");

-- AddForeignKey
ALTER TABLE "embed_settings" ADD CONSTRAINT "embed_settings_chatbot_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;