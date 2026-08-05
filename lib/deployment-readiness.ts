import "server-only";

type Environment = Record<string, string | undefined>;

const placeholder = /^(?:change|replace|choose|your-|sk-your|https?:\/\/localhost|file:)/i;

function strongSecret(value: string | undefined, minimum: number) {
  return Boolean(value && value.length >= minimum && !placeholder.test(value));
}

function productionDatabase(value: string | undefined) {
  if (!value || placeholder.test(value)) return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === "postgresql:" || protocol === "postgres:";
  } catch {
    return false;
  }
}

function publicHttpsUrl(value: string | undefined) {
  if (!value || placeholder.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname !== "localhost";
  } catch {
    return false;
  }
}

export function getDeploymentReadiness(env: Environment = process.env) {
  const checks = [
    { key: "DATABASE_URL", label: "Database PostgreSQL di produzione", ready: productionDatabase(env.DATABASE_URL), required: true },
    { key: "OPENAI_API_KEY", label: "Chiave OpenAI server-side", ready: strongSecret(env.OPENAI_API_KEY, 20), required: true },
    { key: "APP_ACCESS_PASSWORD", label: "Password proprietario robusta", ready: strongSecret(env.APP_ACCESS_PASSWORD, 16), required: true },
    { key: "APP_AUTH_SALT", label: "Salt firma sessione", ready: strongSecret(env.APP_AUTH_SALT, 32), required: true },
    { key: "CRON_SECRET", label: "Protezione automazioni cron", ready: strongSecret(env.CRON_SECRET, 32), required: true },
    { key: "NEXT_PUBLIC_APP_URL", label: "URL pubblico HTTPS", ready: publicHttpsUrl(env.NEXT_PUBLIC_APP_URL), required: true },
    { key: "PINECONE_API_KEY", label: "Pinecone per knowledge base ad alto volume", ready: strongSecret(env.PINECONE_API_KEY, 16), required: false },
    { key: "PINECONE_INDEX_NAME", label: "Indice Pinecone", ready: strongSecret(env.PINECONE_INDEX_NAME || env.PINECONE_INDEX, 3), required: false },
    { key: "WIDGET_SESSION_SECRET", label: "Firma sessioni widget", ready: strongSecret(env.WIDGET_SESSION_SECRET, 32) || (strongSecret(env.APP_AUTH_SALT, 32) && strongSecret(env.APP_ACCESS_PASSWORD, 16)), required: true },
    { key: "INTEGRATION_CONFIG_ENCRYPTION_KEY", label: "Cifratura credenziali integrazioni", ready: Boolean((env.INTEGRATION_CONFIG_ENCRYPTION_KEY || env.META_TOKEN_ENCRYPTION_KEY) && Buffer.from((env.INTEGRATION_CONFIG_ENCRYPTION_KEY || env.META_TOKEN_ENCRYPTION_KEY)!, "base64").length === 32) || (strongSecret(env.APP_AUTH_SALT, 32) && strongSecret(env.APP_ACCESS_PASSWORD, 16)), required: true },
    { key: "FIRECRAWL_API_KEY", label: "Crawler avanzato Firecrawl", ready: strongSecret(env.FIRECRAWL_API_KEY, 16), required: false },
    { key: "RESEND_API_KEY", label: "Avvisi email Resend", ready: strongSecret(env.RESEND_API_KEY, 16) && Boolean(env.RESEND_FROM_EMAIL?.includes("@")), required: false },
    { key: "OPERATIONS_ALERT_EMAIL", label: "Destinatario errori critici", ready: Boolean(env.OPERATIONS_ALERT_EMAIL?.includes("@")), required: false },
    { key: "COMMERCE_CLICK_SECRET", label: "Firma link commerce", ready: strongSecret(env.COMMERCE_CLICK_SECRET, 32) || strongSecret(env.APP_AUTH_SALT, 32), required: false },
    { key: "META_APP_ID", label: "Meta App per WhatsApp e Instagram", ready: strongSecret(env.META_APP_ID, 5), required: false },
    { key: "META_APP_SECRET", label: "Segreto Meta server-side", ready: strongSecret(env.META_APP_SECRET, 16), required: false },
    { key: "META_VERIFY_TOKEN", label: "Verifica webhook Meta", ready: strongSecret(env.META_VERIFY_TOKEN, 32), required: false },
    { key: "META_TOKEN_ENCRYPTION_KEY", label: "Cifratura token Meta", ready: Boolean(env.META_TOKEN_ENCRYPTION_KEY && Buffer.from(env.META_TOKEN_ENCRYPTION_KEY, "base64").length === 32), required: false },
  ];
  const required = checks.filter((check) => check.required);
  return {
    ready: required.every((check) => check.ready),
    completed: required.filter((check) => check.ready).length,
    total: required.length,
    checks,
    missing: required.filter((check) => !check.ready).map((check) => check.key),
  };
}
