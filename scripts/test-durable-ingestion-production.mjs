const baseUrl = process.env.SMOKE_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
const password = process.env.SMOKE_ACCESS_PASSWORD || process.env.APP_ACCESS_PASSWORD;
const proofUrl = process.env.CRAWL_PROOF_URL || baseUrl;
const pollIntervalMs = Number(process.env.INGESTION_POLL_INTERVAL_MS || 3_000);
const timeoutMs = Number(process.env.INGESTION_TIMEOUT_MS || 12 * 60_000);

if (!baseUrl || !password) {
  throw new Error("SMOKE_BASE_URL/NEXT_PUBLIC_APP_URL e APP_ACCESS_PASSWORD sono obbligatori");
}

let authCookie = "";
let botId = "";

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(authCookie ? { Cookie: authCookie } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { response, body };
}

try {
  const login = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  if (!login.response.ok) throw new Error(`Login non riuscito: ${login.response.status}`);
  authCookie = (login.response.headers.get("set-cookie") || "").split(";")[0];

  const created = await request("/api/chatbots", {
    method: "POST",
    body: JSON.stringify({
      companyName: "__DURABLE_CRAWL_PROOF__",
      systemPrompt: "Rispondi solo usando le fonti verificate.",
      settings: {
        role: "Assistente test",
        objective: "Verificare il crawling durevole",
      },
    }),
  });
  if (!created.response.ok || !created.body?.data?.id) {
    throw new Error(`Creazione agente non riuscita: ${JSON.stringify(created.body)}`);
  }
  botId = created.body.data.id;

  const started = await request("/api/ingestion/crawl", {
    method: "POST",
    body: JSON.stringify({
      botId,
      url: proofUrl,
      maxPages: 1,
      maxDepth: 0,
    }),
  });
  if (started.response.status !== 202 || !started.body?.data?.workflowRunId) {
    throw new Error(`Avvio workflow non riuscito: ${JSON.stringify(started.body)}`);
  }

  const { jobId, workflowRunId } = started.body.data;
  let finalStatus;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    const status = await request(
      `/api/ingestion/status?jobId=${encodeURIComponent(jobId)}`,
    );
    if (!status.response.ok) {
      throw new Error(`Lettura stato non riuscita: ${JSON.stringify(status.body)}`);
    }
    finalStatus = status.body.data;
    if (["completed", "failed"].includes(finalStatus.status)) break;
  }

  if (
    finalStatus?.status !== "completed" ||
    finalStatus.sourcesCreated < 1 ||
    finalStatus.chunksCreated < 1
  ) {
    throw new Error(`Crawl non completato: ${JSON.stringify(finalStatus)}`);
  }

  console.log(JSON.stringify({
    success: true,
    jobId,
    workflowRunId,
    status: finalStatus.status,
    sourcesCreated: finalStatus.sourcesCreated,
    chunksCreated: finalStatus.chunksCreated,
    attempts: finalStatus.attempts,
  }));
} finally {
  if (botId) {
    await request("/api/ingestion/cancel", {
      method: "POST",
      body: JSON.stringify({ botId }),
    }).catch(() => {});
    await request(`/api/chatbots/${botId}`, { method: "DELETE" }).catch(() => {});
  }
}
