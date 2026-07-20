import { PrismaClient } from "@prisma/client";

const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const prisma = new PrismaClient();
let authCookie = "";
let botId;
let conversationId;
let workflowId;
let evaluationId;
let integrationId;
let actionId;
let cloneId;
let restoredId;
let isolationBotId;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
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
  if (!response.ok)
    throw new Error(
      `${options.method || "GET"} ${path}: ${response.status} ${text.slice(0, 300)}`,
    );
  return body;
}

async function authenticate() {
  const password =
    process.env.SMOKE_ACCESS_PASSWORD || process.env.APP_ACCESS_PASSWORD;
  if (!password) return;
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) {
    throw new Error(`Smoke authentication failed: ${response.status}`);
  }
  authCookie = (response.headers.get("set-cookie") || "").split(";")[0];
  if (!authCookie) throw new Error("Smoke authentication cookie missing");
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function waitForIngestionJob(jobId, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await request(
      `/api/ingestion/status?jobId=${encodeURIComponent(jobId)}`,
    );
    const job = result.data;
    if (job.status === "completed") return job;
    if (job.status === "failed") {
      throw new Error(`Crawler job failed: ${job.error || "unknown error"}`);
    }
    await new Promise(resolve => setTimeout(resolve, 2_000));
  }
  throw new Error(`Crawler job ${jobId} did not finish within ${timeoutMs}ms`);
}

function smokePdf() {
  const text = "Documento PDF di prova per LitX AI. Questa fonte verifica che il caricamento funzioni in ambiente serverless senza creare cartelle locali. Contiene informazioni sufficienti per essere indicizzata correttamente nella knowledge base del chatbot.";
  const escaped = text.replace(/([\\()])/g, "\\$1");
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output);
}

await authenticate();

try {
  const middlewareBypassAttempt = await fetch(`${baseUrl}/api/system/status`, {
    headers: {
      "x-middleware-subrequest": "middleware:middleware:middleware:middleware:middleware",
    },
  });
  assert(
    middlewareBypassAttempt.status === 401,
    "Protected API accepted an x-middleware-subrequest bypass attempt",
  );
  const health = await request("/api/health");
  assert(
    health.status === "healthy" || health.success !== false,
    "Health check failed",
  );
  const systemStatus = await request("/api/system/status");
  assert(
    systemStatus.data?.operations?.level &&
      typeof systemStatus.data.operations.ingestion?.pending === "number",
    "Operational health summary is missing",
  );
  assert(
    typeof systemStatus.data?.deployment?.ready === "boolean" &&
      Array.isArray(systemStatus.data.deployment.missing),
    "Deployment readiness summary is missing",
  );

  const created = await request("/api/chatbots", {
    method: "POST",
    body: JSON.stringify({
      companyName: "__SMOKE_TEST__",
      systemPrompt: "System prompt smoke test",
      settings: {
        language: "Italiano",
        tone: "Professionale",
        responseLength: "short",
        fallbackMessage: "Fallback",
        handoffMessage: "Passaggio a operatore attivato.",
        aiModel: "gpt-3.5-turbo",
        temperature: 0.2,
        maxTokens: 256,
        rules: ["Non inventare"],
        personality: "Calmo e trasparente",
        forbiddenTopics: ["Diagnosi mediche"],
        forbiddenResponses: ["Promesse garantite"],
        handoffTriggers: ["Richiesta esplicita di un operatore"],
        leadCollectionFields: ["Nome", "Email", "Consenso privacy"],
      },
    }),
  });
  botId = created.data.id;
  assert(
    botId && created.data.systemPrompt === "System prompt smoke test",
    "Chatbot creation failed",
  );
  const blockingJob = await prisma.ingestionJob.create({
    data: {
      botId,
      jobType: "url",
      params: JSON.stringify({ singleUrl: "https://example.com/pending" }),
      status: "running",
      attempts: 1,
      maxAttempts: 5,
      startedAt: new Date(),
    },
  });
  const deleteWhileIndexing = await fetch(`${baseUrl}/api/chatbots/${botId}`, {
    method: "DELETE",
    headers: authCookie ? { Cookie: authCookie } : {},
  });
  assert(
    deleteWhileIndexing.status === 409,
    "Agent deletion did not guard against an active ingestion race",
  );
  await prisma.ingestionJob.delete({ where: { id: blockingJob.id } });
  assert(created.data.isActive === false, "New agents must start as drafts");
  assert(
    created.data.settings.aiModel === "gpt-4o-mini",
    "Legacy AI model was not normalized",
  );
  assert(
    created.data.settings.personality === "Calmo e trasparente" &&
      created.data.settings.forbiddenTopics?.[0] === "Diagnosi mediche" &&
      created.data.settings.handoffTriggers?.[0] ===
        "Richiesta esplicita di un operatore" &&
      created.data.settings.leadCollectionFields?.includes("Consenso privacy"),
    "Advanced agent instructions were not persisted",
  );
  const notificationJob = await prisma.ingestionJob.create({
    data: {
      botId,
      jobType: "url",
      params: JSON.stringify({ singleUrl: "https://example.com/smoke" }),
      status: "failed",
      attempts: 5,
      maxAttempts: 5,
      errorMessage: "Controlled crawler notification failure",
      completedAt: new Date(),
    },
  });
  const operationalNotifications = await request("/api/notifications?limit=100");
  const crawlerNotification = operationalNotifications.data.find(
    (item) => item.key === `ingestion:${notificationJob.id}`,
  );
  assert(
    crawlerNotification?.type === "ingestion" &&
      crawlerNotification.href === `/chatbot/${botId}/jobs`,
    "Crawler failure notification is missing",
  );
  assert(
    new Set(operationalNotifications.data.map((item) => item.key)).size ===
      operationalNotifications.data.length,
    "Operational notifications are not deduplicated",
  );
  const initialReadiness = await request(`/api/chatbots/${botId}/readiness`);
  assert(
    initialReadiness.data.ready === false && initialReadiness.data.total === 5,
    "Agent readiness checklist failed",
  );
  const pdfForm = new FormData();
  pdfForm.set("botId", botId);
  pdfForm.set("file", new File([smokePdf()], "serverless-smoke.pdf", { type: "application/pdf" }));
  const pdfUploadResponse = await fetch(`${baseUrl}/api/knowledge-sources/upload-pdf`, {
    method: "POST",
    headers: authCookie ? { Cookie: authCookie } : {},
    body: pdfForm,
  });
  const pdfUpload = await pdfUploadResponse.json();
  assert(
    pdfUploadResponse.status === 201 && pdfUpload.data?.status === "completed" && pdfUpload.data?.chunks > 0,
    `Serverless PDF upload failed: ${pdfUpload.error || pdfUploadResponse.status}`,
  );
  const afterPdfImport = await request(`/api/chatbots/${botId}`);
  assert(
    afterPdfImport.data.kbStatus === "ready" &&
      afterPdfImport.data.kbTotalChunks >= pdfUpload.data.chunks,
    "Direct PDF import did not make the agent knowledge base ready",
  );
  const manualPreview = await request("/api/knowledge-sources/manual", {
    method: "POST",
    body: JSON.stringify({
      botId,
      title: "Smoke FAQ",
      content:
        "Domanda: Come funziona il servizio? Risposta: Questa è una fonte di prova usata per verificare anteprima e validazione prima della indicizzazione.",
      previewOnly: true,
    }),
  });
  assert(
    manualPreview.data.type === "manual" && manualPreview.data.characters > 50,
    "Manual knowledge preview failed",
  );
  const genericKnowledge = await request("/api/knowledge-sources", {
    method: "POST",
    body: JSON.stringify({
      botId,
      sourceType: "manual",
      originalFilename: "Smoke generic source",
      contentText:
        "Questa fonte verifica che anche l’endpoint generale della knowledge base indicizzi davvero il contenuto, generi gli embedding e aggiorni lo stato dell’agente senza lasciare fonti bloccate in elaborazione.",
    }),
  });
  assert(
    genericKnowledge.data.status === "completed" &&
      genericKnowledge.data.chunkCount > 0,
    "Generic knowledge endpoint did not index the source",
  );
  const privateUrlImport = await fetch(
    `${baseUrl}/api/knowledge-sources/add-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authCookie ? { Cookie: authCookie } : {}),
      },
      body: JSON.stringify({
        botId,
        url: "http://127.0.0.1/private-metadata",
      }),
    },
  );
  assert(
    privateUrlImport.status === 400,
    "URL ingestion accepted a private-network address",
  );
  const oversizedCrawl = await fetch(
    `${baseUrl}/api/knowledge-sources/crawl-with-progress`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authCookie ? { Cookie: authCookie } : {}),
      },
      body: JSON.stringify({
        botId,
        url: "https://example.com",
        maxPages: 26,
        maxDepth: 3,
      }),
    },
  );
  assert(
    oversizedCrawl.status === 400,
    "Crawler accepted a request above its production page limit",
  );
  const liveCrawl = await request("/api/knowledge-sources/crawl-with-progress", {
    method: "POST",
    body: JSON.stringify({
      botId,
      url: "https://www.iana.org/domains/reserved",
      maxPages: 1,
      maxDepth: 0,
    }),
  });
  const crawledJob = await waitForIngestionJob(liveCrawl.jobId);
  assert(
    crawledJob.sourcesCreated === 1 && crawledJob.chunksCreated > 0,
    "Live crawler completed without creating searchable knowledge",
  );

  const updated = await request(`/api/chatbots/${botId}`, {
    method: "PATCH",
    body: JSON.stringify({
      settings: { role: "Assistente test", objective: "Verificare il flusso" },
    }),
  });
  assert(
    updated.data.settings.role === "Assistente test" &&
      updated.data.settings.language === "Italiano" &&
      updated.data.settings.aiModel === "gpt-4o-mini" &&
      updated.data.settings.rules.length === 1,
    "Partial agent settings update lost existing configuration",
  );
  const promptVersions = await request(
    `/api/chatbots/${botId}/prompt-versions`,
  );
  assert(
    promptVersions.data.length === 1 && promptVersions.data[0].version === 1,
    "Prompt versioning failed",
  );

  const widget = await request(`/api/chatbots/${botId}/embed`, {
    method: "PUT",
    body: JSON.stringify({
      enabled: true,
      title: "Smoke Assistant",
      subtitle: "Test",
      theme: "light",
      position: "bottom-right",
      primaryColor: "#633cff",
      autoOpen: false,
      showLauncher: true,
      customCSS: "",
      allowedDomains: "smoke.example",
      widgetShape: "rounded",
      iconType: "emoji",
      iconValue: "AI",
      widgetSize: "small",
      animation: true,
      shadow: true,
      gradient: false,
    }),
  });
  assert(
    widget.widgetShape === "rounded" && widget.widgetSize === "small",
    "Widget settings were not persisted",
  );
  const widgetScript = await fetch(
    `${baseUrl}/api/embed/widget.js?botId=${botId}`,
    { headers: { Origin: "https://smoke.example" } },
  );
  assert(
    widgetScript.status === 403,
    "Draft agent widget must not be publicly available",
  );
  const widgetConfig = await fetch(`${baseUrl}/api/embed/${botId}`, {
    headers: { Origin: "https://smoke.example" },
  });
  assert(
    widgetConfig.status === 403,
    "Draft agent configuration must not be publicly available",
  );
  const oversizedChat = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ botId, message: "x".repeat(4001) }),
  });
  assert(
    oversizedChat.status === 400,
    "Oversized chat payload was not rejected",
  );
  const draftChat = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://smoke.example",
    },
    body: JSON.stringify({ botId, message: "Test widget", source: "widget" }),
  });
  assert(
    draftChat.status === 403 &&
      draftChat.headers.get("access-control-allow-origin") ===
        "https://smoke.example",
    "Draft agent accepted a public widget message",
  );
  const chatPreflight = await fetch(`${baseUrl}/api/chat`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://smoke.example",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  assert(
    chatPreflight.status === 204 &&
      chatPreflight.headers.get("access-control-allow-origin") ===
        "https://smoke.example" &&
      chatPreflight.headers.get("access-control-allow-methods")?.includes("POST"),
    "Widget CORS preflight failed",
  );
  const staticWidget = await fetch(`${baseUrl}/chatbot-widget.js`);
  const widgetSource = await staticWidget.text();
  assert(
    staticWidget.ok &&
      widgetSource.includes("data.data.assistantMessage.content") &&
      widgetSource.includes("source: 'widget'") &&
      widgetSource.includes("chatbot-quick-reply") &&
      widgetSource.includes("chatbot-feedback") &&
      widgetSource.includes("chatbot-sources"),
    "Widget script is incompatible",
  );

  const conversation = await request("/api/conversations", {
    method: "POST",
    body: JSON.stringify({ botId, userSessionId: "smoke_session" }),
  });
  conversationId = conversation.data.id;
  const isolationBot = await request("/api/chatbots", {
    method: "POST",
    body: JSON.stringify({
      companyName: "__SMOKE_ISOLATION__",
      systemPrompt: "Agente usato per verificare isolamento conversazioni.",
    }),
  });
  isolationBotId = isolationBot.data.id;
  const crossAgentConversation = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      botId: isolationBotId,
      conversationId,
      message: "Non deve accedere a questa conversazione",
    }),
  });
  assert(
    crossAgentConversation.status === 404,
    "A conversation was accepted by a different agent",
  );
  await request(`/api/conversations/${conversationId}`, {
    method: "PATCH",
    body: JSON.stringify({
      userName: "Smoke Client",
      needsHumanEscalation: true,
      assignedAgent: "Sebastian",
      internalNotes: "Nota operativa smoke",
      tags: ["urgente", "smoke"],
    }),
  });
  await request("/api/messages", {
    method: "POST",
    body: JSON.stringify({
      conversationId,
      role: "user",
      content: "Vorrei informazioni sul servizio e sui prossimi passi.",
    }),
  });
  const assistantMessage = await request("/api/messages", {
    method: "POST",
    body: JSON.stringify({
      conversationId,
      role: "assistant",
      content: "Risposta smoke",
    }),
  });
  await request(`/api/embed/${botId}/feedback`, {
    method: "POST",
    body: JSON.stringify({
      messageId: assistantMessage.data.id,
      feedback: "positive",
    }),
  });
  const capturedLead = await request(`/api/embed/${botId}/lead`, {
    method: "POST",
    body: JSON.stringify({
      conversationId,
      name: "Smoke Client",
      email: "smoke@example.com",
      phone: "+39 333 123 4567",
      company: "Smoke SRL",
      consent: true,
    }),
  });
  assert(
    capturedLead.data.contactId && capturedLead.data.leadScore >= 55,
    "Public lead capture did not create a CRM contact",
  );
  const detail = await request(`/api/conversations/${conversationId}`);
  assert(
    detail.data.userName === "Smoke Client" &&
      detail.data.messages.at(-1)?.content === "Risposta smoke" &&
      detail.data.messages.at(-1)?.feedback === "positive" &&
      detail.data.userEmail === "smoke@example.com" &&
      detail.data.userCompany === "Smoke SRL" &&
      detail.data.internalNotes === "Nota operativa smoke" &&
      detail.data.tags.includes("urgente"),
    "Inbox and public widget feedback flow failed",
  );
  const widgetHistory = await request(
    `/api/embed/${botId}/conversations/${conversationId}?sessionId=smoke_session`,
  );
  assert(
    widgetHistory.data.messages.length === 2 &&
      widgetHistory.data.messages.at(-1)?.feedback === "positive" &&
      widgetHistory.data.needsHumanEscalation === true &&
      widgetHistory.data.assignedAgent === "Sebastian",
    "Public widget history was not restored",
  );
  const foreignSessionHistory = await fetch(
    `${baseUrl}/api/embed/${botId}/conversations/${conversationId}?sessionId=wrong-session`,
    { headers: authCookie ? { Cookie: authCookie } : {} },
  );
  assert(
    foreignSessionHistory.status === 404,
    "Widget history was exposed to a different visitor session",
  );
  if (process.env.SMOKE_AI_ASSIST === "true") {
    const assist = await request(
      `/api/conversations/${conversationId}/assist`,
      { method: "POST", body: JSON.stringify({ mode: "reply" }) },
    );
    assert(
      assist.data.suggestedReply?.length > 10 &&
        assist.data.summary?.length > 10 &&
        Array.isArray(assist.data.tags),
      "Help Desk AI assistance failed",
    );
    const usage = await request(`/api/ai-usage?botId=${botId}&days=1`);
    assert(
      usage.data.summary.calls >= 1 &&
        usage.data.summary.totalTokens > 0 &&
        usage.data.summary.estimatedCostUsd > 0 &&
        usage.data.byModel.length > 0,
      "AI usage tracking failed",
    );
  }
  const exportResponse = await fetch(
    `${baseUrl}/api/conversations/export?botId=${botId}&status=all`,
    { headers: authCookie ? { Cookie: authCookie } : {} },
  );
  const exportCsv = await exportResponse.text();
  assert(
    exportResponse.ok &&
      exportResponse.headers.get("content-type")?.includes("text/csv") &&
      exportCsv.includes("Smoke Client") &&
      exportCsv.includes("Nota operativa smoke"),
    "Conversation CSV export failed",
  );
  const contacts = await request(`/api/contacts?botId=${botId}`);
  const contact = contacts.data[0];
  assert(contact?.email === "smoke@example.com", "CRM synchronization failed");
  const contactUpdate = await request(`/api/contacts/${contact.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      stage: "qualified",
      potentialValue: 1200,
      tags: ["smoke"],
      note: "Smoke note",
    }),
  });
  assert(
    contactUpdate.data.stage === "qualified" &&
      contactUpdate.data.notes.length === 1,
    "CRM pipeline persistence failed",
  );

  const flow = await request("/api/workflows", {
    method: "POST",
    body: JSON.stringify({
      botId,
      name: "Smoke workflow",
      steps: [
        {
          id: "step-1",
          type: "handoff",
          title: "Handoff",
          config: { reason: "Smoke" },
        },
      ],
      isActive: false,
    }),
  });
  workflowId = flow.data.id;
  const flowUpdate = await request(`/api/workflows/${workflowId}`, {
    method: "PATCH",
    body: JSON.stringify({ isActive: true }),
  });
  assert(flowUpdate.data.isActive === true, "Workflow update failed");

  const evaluation = await request("/api/evaluations", {
    method: "POST",
    body: JSON.stringify({
      botId,
      name: "Smoke evaluation",
      question: "Cosa fate?",
      expectedKeywords: ["servizio"],
      forbiddenKeywords: ["inventato"],
      minimumConfidence: 0.4,
    }),
  });
  evaluationId = evaluation.data.id;
  assert(
    evaluation.data.expectedKeywords[0] === "servizio",
    "Evaluation case creation failed",
  );
  const evaluationRun = await request("/api/evaluations/runs", {
    method: "POST",
    body: JSON.stringify({
      caseId: evaluationId,
      passed: true,
      response: "Risposta controllata",
      confidence: 0.9,
      latencyMs: 10,
    }),
  });
  assert(
    evaluationRun.data.passed === true,
    "Evaluation run was not persisted",
  );
  let evaluations = await request(`/api/evaluations?botId=${botId}`);
  for (const item of evaluations.data.filter(
    (candidate) => candidate.isActive && candidate.runs[0]?.passed !== true,
  )) {
    await request("/api/evaluations/runs", {
      method: "POST",
      body: JSON.stringify({
        caseId: item.id,
        passed: true,
        response: "Controllo di sicurezza superato nello smoke test",
        confidence: 0.9,
        latencyMs: 10,
      }),
    });
  }
  evaluations = await request(`/api/evaluations?botId=${botId}`);
  assert(
    evaluations.data.filter((item) => item.isActive).every(
      (item) => item.runs[0]?.passed === true,
    ),
    "Evaluation history failed",
  );

  const completedReadiness = await request(
    `/api/chatbots/${botId}/readiness`,
  );
  assert(
    completedReadiness.data.ready === true &&
      completedReadiness.data.completed === completedReadiness.data.total &&
      completedReadiness.data.checks.every((check) => check.done === true),
    "A fully configured agent did not reach publish readiness",
  );
  const published = await request(`/api/chatbots/${botId}`, {
    method: "PATCH",
    body: JSON.stringify({ isActive: true }),
  });
  assert(published.data.isActive === true, "Agent publication failed");
  const publishedWidgetConfig = await fetch(`${baseUrl}/api/embed/${botId}`, {
    headers: { Origin: "https://smoke.example" },
  });
  assert(
    publishedWidgetConfig.ok &&
      (await publishedWidgetConfig.json()).botId === botId,
    "Published agent widget configuration is unavailable",
  );
  const publishedWidgetScript = await fetch(
    `${baseUrl}/api/embed/widget.js?botId=${botId}`,
    { headers: { Origin: "https://smoke.example" } },
  );
  assert(
    publishedWidgetScript.ok &&
      (await publishedWidgetScript.text()).includes(`"botId":"${botId}"`),
    "Published agent widget script is unavailable",
  );
  if (process.env.SMOKE_AI_ASSIST === "true") {
    const publicChatResponse = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://smoke.example",
      },
      body: JSON.stringify({
        botId,
        message: "Cosa verifica il documento PDF presente nelle fonti?",
        source: "widget",
        userSessionId: `published_smoke_${Date.now()}`,
      }),
    });
    const publicChat = await publicChatResponse.json();
    assert(
      publicChatResponse.ok &&
        publicChat.success === true &&
        publicChat.data?.assistantMessage?.content?.length > 10 &&
        publicChat.data?.sources?.length > 0,
      `Published agent did not answer from its knowledge base: ${publicChat.error || publicChatResponse.status}`,
    );
  }
  const blockedWidgetOrigin = await fetch(`${baseUrl}/api/embed/${botId}`, {
    headers: { Origin: "https://not-allowed.example" },
  });
  assert(
    blockedWidgetOrigin.status === 403,
    "Published widget ignored its allowed-domain restriction",
  );

  const integration = await request("/api/integrations", {
    method: "POST",
    body: JSON.stringify({
      botId,
      provider: "public-page",
      config: {},
      enabled: true,
    }),
  });
  integrationId = integration.data.id;
  const integrations = await request(`/api/integrations?botId=${botId}`);
  assert(
    integrations.data.find((item) => item.provider === "public-page")
      ?.connection?.enabled === true,
    "Native channel connection failed",
  );
  const webhookSecret = "smoke-webhook-secret-123456";
  const webhookIntegration = await request("/api/integrations", {
    method: "POST",
    body: JSON.stringify({
      botId,
      provider: "webhook",
      config: {
        endpoint: "https://example.com/litx-webhook",
        secret: webhookSecret,
        events: "lead.captured, conversation.handoff_requested",
      },
      enabled: true,
    }),
  });
  assert(
    webhookIntegration.data.config.secret !== webhookSecret &&
      webhookIntegration.data.config.secret,
    "Webhook integration exposed its signing secret",
  );
  await request("/api/integrations", {
    method: "POST",
    body: JSON.stringify({
      botId,
      provider: "webhook",
      config: {
        ...webhookIntegration.data.config,
        events: "lead.captured",
      },
      enabled: true,
    }),
  });
  const storedWebhookIntegration =
    await prisma.integrationConnection.findUnique({
      where: { botId_provider: { botId, provider: "webhook" } },
    });
  assert(
    JSON.parse(storedWebhookIntegration?.config || "{}").secret ===
      webhookSecret,
    "Masked webhook integration update overwrote the stored secret",
  );

  const webhookActionSecret = "smoke-action-secret-123456";
  const webhookAction = await request("/api/actions", {
    method: "POST",
    body: JSON.stringify({
      botId,
      name: "Temporary signed webhook",
      type: "webhook",
      triggerKeywords: ["signed smoke"],
      config: {
        url: "https://example.com/litx-action",
        secret: webhookActionSecret,
        event: "smoke.action",
      },
      enabled: false,
    }),
  });
  assert(
    webhookAction.data.config.secret !== webhookActionSecret &&
      webhookAction.data.config.secret,
    "Webhook action exposed its signing secret",
  );
  await request(`/api/actions/${webhookAction.data.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      config: {
        ...webhookAction.data.config,
        event: "smoke.action.updated",
      },
    }),
  });
  const storedWebhookAction = await prisma.agentAction.findUnique({
    where: { id: webhookAction.data.id },
  });
  assert(
    JSON.parse(storedWebhookAction?.config || "{}").secret ===
      webhookActionSecret,
    "Masked webhook action update overwrote the stored secret",
  );
  await request(`/api/actions/${webhookAction.data.id}`, {
    method: "DELETE",
  });

  const action = await request("/api/actions", {
    method: "POST",
    body: JSON.stringify({
      botId,
      name: "Smoke booking action",
      type: "booking_link",
      triggerKeywords: ["prenota smoke"],
      config: { url: "https://calendly.com/example/smoke", label: "Prenota" },
    }),
  });
  actionId = action.data.id;
  const actionUpdate = await request(`/api/actions/${actionId}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled: false }),
  });
  assert(actionUpdate.data.enabled === false, "Action update failed");

  const backupResponse = await fetch(`${baseUrl}/api/chatbots/${botId}/export`, {
    headers: authCookie ? { Cookie: authCookie } : {},
  });
  const backup = await backupResponse.json();
  assert(
    backupResponse.ok &&
      backup.format === "litx-agent-backup" &&
      backup.version === 1 &&
      backup.actions.length === 1 &&
      backup.workflows.length === 1 &&
      !("knowledgeSources" in backup),
    "Agent backup export failed",
  );
  assert(
    !JSON.stringify(backup).includes(webhookSecret),
    "Agent backup exposed a webhook signing secret",
  );
  const cloned = await request(`/api/chatbots/${botId}/clone`, {
    method: "POST",
    body: JSON.stringify({ companyName: "__SMOKE_CLONE__" }),
  });
  cloneId = cloned.data.id;
  assert(
    cloned.copied.workflows === 1 &&
      cloned.copied.actions === 1 &&
      cloned.copied.evaluations >= 3 &&
      cloned.copied.widgetAppearance === true &&
      cloned.copied.knowledgeSources === 0,
    "Agent clone contents failed",
  );
  const cloneDetail = await request(`/api/chatbots/${cloneId}`);
  assert(
    cloneDetail.data.isActive === false &&
      cloneDetail.data.kbStatus === "empty" &&
      cloneDetail.data.knowledgeSources.length === 0 &&
      cloneDetail.embedSettings?.enabled === false,
    "Agent clone safety defaults failed",
  );
  const restored = await request("/api/chatbots/import", {
    method: "POST",
    body: JSON.stringify(backup),
  });
  restoredId = restored.data.id;
  assert(
    restored.imported.workflows === 1 &&
      restored.imported.actions === 1 &&
      restored.imported.evaluations >= 3 &&
      restored.imported.knowledgeSources === 0 &&
      restored.imported.integrations === 0,
    "Agent backup import contents failed",
  );
  const restoredDetail = await request(`/api/chatbots/${restoredId}`);
  assert(
    restoredDetail.data.isActive === false &&
      restoredDetail.data.kbStatus === "empty" &&
      restoredDetail.data.knowledgeSources.length === 0 &&
      restoredDetail.embedSettings?.enabled === false &&
      restoredDetail.embedSettings?.allowedDomains === null,
    "Agent backup import safety defaults failed",
  );

  const search = await request("/api/search?q=SMOKE_TEST");
  assert(
    search.data.some((item) => item.type === "Agente" && item.id === botId),
    "Global search failed",
  );
  const suggestions = await request(
    `/api/suggestions?botId=${restoredId}&status=pending`,
  );
  assert(
    suggestions.data.some(
      (item) => item.botId === restoredId && item.category === "knowledge",
    ),
    "Suggestion engine failed",
  );

  const privacyConversation = await request("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      botId,
      userSessionId: "privacy_smoke_session",
    }),
  });
  await request(`/api/conversations/${privacyConversation.data.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      userName: "Privacy Smoke",
      userEmail: "privacy-smoke@example.com",
      userPhone: "+39 320 555 0188",
    }),
  });
  await request("/api/messages", {
    method: "POST",
    body: JSON.stringify({
      conversationId: privacyConversation.data.id,
      role: "user",
      content: "Messaggio personale da esportare e cancellare.",
    }),
  });
  await request(`/api/contacts?botId=${botId}`);
  const privacyParams = new URLSearchParams({
    botId,
    matchBy: "email",
    query: "privacy-smoke@example.com",
  });
  if (authCookie) {
    const unauthenticatedPrivacy = await fetch(
      `${baseUrl}/api/privacy/visitor-data?${privacyParams}`,
    );
    assert(
      unauthenticatedPrivacy.status === 401,
      "Visitor privacy data was exposed without owner authentication",
    );
  }
  const privacyExport = await request(
    `/api/privacy/visitor-data?${privacyParams}`,
  );
  assert(
    privacyExport.data.counts.conversations === 1 &&
      privacyExport.data.counts.messages === 1 &&
      privacyExport.data.counts.crmContacts === 1 &&
      privacyExport.data.conversations[0].messages[0].content.includes(
        "personale",
    ),
    "Visitor privacy export did not include all personal data",
  );
  const privacyDownload = await fetch(
    `${baseUrl}/api/privacy/visitor-data?${privacyParams}&download=1`,
    { headers: authCookie ? { Cookie: authCookie } : {} },
  );
  assert(
    privacyDownload.ok &&
      privacyDownload.headers
        .get("content-disposition")
        ?.includes("dati-visitatore-") &&
      (await privacyDownload.text()).includes("privacy-smoke@example.com"),
    "Visitor privacy download was not generated correctly",
  );
  const phonePrivacyParams = new URLSearchParams({
    botId,
    matchBy: "phone",
    query: "393205550188",
  });
  const privacyByPhone = await request(
    `/api/privacy/visitor-data?${phonePrivacyParams}`,
  );
  assert(
    privacyByPhone.data.counts.conversations === 1 &&
      privacyByPhone.data.counts.crmContacts === 1,
    "Visitor privacy phone normalization failed",
  );
  const sessionPrivacyParams = new URLSearchParams({
    botId,
    matchBy: "session",
    query: "privacy_smoke_session",
  });
  const privacyBySession = await request(
    `/api/privacy/visitor-data?${sessionPrivacyParams}`,
  );
  assert(
    privacyBySession.data.counts.conversations === 1 &&
      privacyBySession.data.counts.crmContacts === 1,
    "Visitor privacy session lookup left linked CRM data behind",
  );
  const invalidPrivacyDelete = await fetch(
    `${baseUrl}/api/privacy/visitor-data`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(authCookie ? { Cookie: authCookie } : {}),
      },
      body: JSON.stringify({
        botId,
        matchBy: "email",
        query: "privacy-smoke@example.com",
        confirmation: "NO",
      }),
    },
  );
  assert(
    invalidPrivacyDelete.status === 400,
    "Privacy deletion accepted an invalid confirmation",
  );
  const privacyDelete = await request("/api/privacy/visitor-data", {
    method: "DELETE",
    body: JSON.stringify({
      botId,
      matchBy: "email",
      query: "privacy-smoke@example.com",
      confirmation: "ELIMINA",
    }),
  });
  assert(
    privacyDelete.data.deletedConversations === 1 &&
      privacyDelete.data.deletedContacts === 1 &&
      privacyDelete.data.deletedMessages === 1,
    "Visitor privacy deletion returned incorrect counts",
  );
  const privacyAfterDelete = await request(
    `/api/privacy/visitor-data?${privacyParams}`,
  );
  assert(
    privacyAfterDelete.data.counts.conversations === 0 &&
      privacyAfterDelete.data.counts.crmContacts === 0,
    "Visitor personal data remained after deletion",
  );

  const retentionSettings = await request(`/api/chatbots/${botId}`, {
    method: "PATCH",
    body: JSON.stringify({ settings: { dataRetentionDays: 30 } }),
  });
  assert(
    retentionSettings.data.settings.dataRetentionDays === 30,
    "Agent retention policy was not persisted",
  );
  const retentionConversation = await request("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      botId,
      userSessionId: "retention_smoke_session",
    }),
  });
  await request(`/api/conversations/${retentionConversation.data.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      userName: "Retention Smoke",
      userEmail: "retention-smoke@example.com",
    }),
  });
  await request("/api/messages", {
    method: "POST",
    body: JSON.stringify({
      conversationId: retentionConversation.data.id,
      role: "user",
      content: "Dato scaduto da eliminare con la policy.",
    }),
  });
  await request(`/api/contacts?botId=${botId}`);
  const expiredAt = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  await prisma.conversation.update({
    where: { id: retentionConversation.data.id },
    data: { startedAt: expiredAt, lastMessageAt: expiredAt },
  });
  await prisma.cRMContact.updateMany({
    where: { botId, email: "retention-smoke@example.com" },
    data: { lastInteraction: expiredAt },
  });
  const retentionPreview = await request(
    `/api/privacy/retention?botId=${botId}`,
  );
  assert(
    retentionPreview.data[0].retentionDays === 30 &&
      retentionPreview.data[0].expiredConversations === 1 &&
      retentionPreview.data[0].expiredContacts === 1,
    "Retention preview did not identify expired personal data",
  );
  const invalidRetentionCleanup = await fetch(
    `${baseUrl}/api/privacy/retention`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authCookie ? { Cookie: authCookie } : {}),
      },
      body: JSON.stringify({
        botId,
        confirmation: "NO",
      }),
    },
  );
  assert(
    invalidRetentionCleanup.status === 400,
    "Retention cleanup accepted an invalid confirmation",
  );
  const retentionCleanup = await request("/api/privacy/retention", {
    method: "POST",
    body: JSON.stringify({
      botId,
      confirmation: "PULISCI DATI SCADUTI",
    }),
  });
  assert(
    retentionCleanup.data.totals.conversations === 1 &&
      retentionCleanup.data.totals.crmContacts === 1,
    "Retention cleanup returned incorrect deletion counts",
  );
  const retentionAfterCleanup = await request(
    `/api/privacy/retention?botId=${botId}`,
  );
  assert(
    retentionAfterCleanup.data[0].expiredConversations === 0 &&
      retentionAfterCleanup.data[0].expiredContacts === 0,
    "Expired personal data remained after retention cleanup",
  );
  const unauthorizedCron = await fetch(
    `${baseUrl}/api/cron/data-retention`,
  );
  assert(
    unauthorizedCron.status === 401,
    "Scheduled retention endpoint accepted an unauthenticated request",
  );
  if (process.env.SMOKE_CRON_SECRET) {
    const authorizedCron = await fetch(
      `${baseUrl}/api/cron/data-retention`,
      {
        headers: {
          Authorization: `Bearer ${process.env.SMOKE_CRON_SECRET}`,
        },
      },
    );
    assert(
      authorizedCron.ok && (await authorizedCron.json()).success,
      "Scheduled retention endpoint rejected its configured secret",
    );
  }

  const knowledgeSyncSettings = await request(`/api/chatbots/${botId}`, {
    method: "PATCH",
    body: JSON.stringify({ settings: { knowledgeSyncDays: 1 } }),
  });
  assert(
    knowledgeSyncSettings.data.settings.knowledgeSyncDays === 1,
    "Knowledge sync frequency was not persisted",
  );
  const staleKnowledgeSource = await prisma.knowledgeSource.create({
    data: {
      botId,
      sourceType: "url",
      sourceUrl: "https://example.com/sync-smoke-faq",
      contentText:
        "Contenuto di prova abbastanza lungo per rappresentare una fonte web già indicizzata.",
      status: "completed",
      processedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      chunkCount: 1,
    },
  });
  const knowledgeSyncPreview = await request(
    `/api/knowledge-sources/sync?botId=${botId}`,
  );
  assert(
    knowledgeSyncPreview.data[0].syncDays === 1 &&
      knowledgeSyncPreview.data[0].urlSources >= 2 &&
      knowledgeSyncPreview.data[0].staleSources === 1,
    "Knowledge sync preview did not detect an obsolete URL source",
  );
  const firstKnowledgeSync = await request("/api/knowledge-sources/sync", {
    method: "POST",
    body: JSON.stringify({ botId, limit: 3 }),
  });
  const secondKnowledgeSync = await request("/api/knowledge-sources/sync", {
    method: "POST",
    body: JSON.stringify({ botId, limit: 3 }),
  });
  const queuedSyncJobs = await prisma.ingestionJob.findMany({
    where: {
      botId,
      dedupeKey: { startsWith: `knowledge-sync:${staleKnowledgeSource.id}:` },
    },
  });
  const queuedParams = JSON.parse(queuedSyncJobs[0]?.params || "{}");
  assert(
    firstKnowledgeSync.data.scheduled === 1 &&
      secondKnowledgeSync.data.jobs[0].id === firstKnowledgeSync.data.jobs[0].id &&
      queuedSyncJobs.length === 1 &&
      queuedParams.replaceSourceId === staleKnowledgeSource.id,
    "Knowledge sync scheduling created a duplicate or unsafe replacement job",
  );
  const unauthorizedKnowledgeCron = await fetch(
    `${baseUrl}/api/cron/knowledge-sync`,
  );
  assert(
    unauthorizedKnowledgeCron.status === 401,
    "Knowledge sync cron accepted an unauthenticated request",
  );
  if (process.env.SMOKE_CRON_SECRET) {
    // The cron route must be authenticated in CI without making this smoke test
    // depend on the availability of an external website. The scheduling and
    // deduplication behaviour was verified above; disabling this ephemeral agent
    // leaves the authenticated cron with no external crawl to execute.
    await prisma.chatbot.update({
      where: { id: botId },
      data: { isActive: false },
    });
    const authorizedKnowledgeCron = await fetch(
      `${baseUrl}/api/cron/knowledge-sync`,
      {
        headers: {
          Authorization: `Bearer ${process.env.SMOKE_CRON_SECRET}`,
        },
      },
    );
    assert(
      authorizedKnowledgeCron.ok &&
        (await authorizedKnowledgeCron.json()).success,
      "Knowledge sync cron rejected its configured secret",
    );
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        checks: [
          "health",
          "owner-proxy-bypass-rejection",
          "agent",
          "agent-deletion-ingestion-guard",
          "settings",
          "prompt-versions",
          "knowledge-preview",
          "generic-knowledge-indexing",
          "pdf-upload-serverless",
          "direct-import-readiness",
          "crawler-input-safety",
          "crawler-live-ingestion",
          "widget",
          "widget-feedback",
          "widget-cors",
          "widget-lead-capture",
          "widget-source-citations",
          "conversation-isolation",
          "widget-history",
          "widget-session-ownership",
          "widget-human-handoff",
          "embed",
          "inbox-notes-tags",
          ...(process.env.SMOKE_AI_ASSIST === "true"
            ? ["helpdesk-ai", "ai-usage-costs"]
            : []),
          "crm",
          "workflow",
          "evaluations",
          "agent-readiness",
          "agent-publication",
          "published-widget",
          ...(process.env.SMOKE_AI_ASSIST === "true"
            ? ["published-agent-chat"]
            : []),
          "widget-domain-restriction",
          "integrations",
          "webhook-secret-redaction",
          "actions",
          "agent-backup",
          "agent-clone",
          "agent-restore",
          "search",
          "suggestions",
          "visitor-privacy-export",
          "visitor-privacy-delete",
          ...(authCookie ? ["visitor-privacy-auth"] : []),
          "retention-policy",
          "retention-cleanup",
          "retention-cron-auth",
          "knowledge-sync-preview",
          "knowledge-sync-deduplication",
          "knowledge-sync-cron-auth",
          "operational-health",
          "crawler-notifications",
          "deployment-readiness",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  if (restoredId)
    await request(`/api/chatbots/${restoredId}`, {
      method: "DELETE",
    }).catch(() => {});
  if (isolationBotId)
    await request(`/api/chatbots/${isolationBotId}`, {
      method: "DELETE",
    }).catch(() => {});
  if (cloneId)
    await request(`/api/chatbots/${cloneId}`, {
      method: "DELETE",
    }).catch(() => {});
  if (actionId)
    await request(`/api/actions/${actionId}`, {
      method: "DELETE",
    }).catch(() => {});
  if (integrationId)
    await request(`/api/integrations/${integrationId}`, {
      method: "DELETE",
    }).catch(() => {});
  if (evaluationId)
    await request(`/api/evaluations/${evaluationId}`, {
      method: "DELETE",
    }).catch(() => {});
  if (workflowId)
    await request(`/api/workflows/${workflowId}`, {
      method: "DELETE",
    }).catch(() => {});
  if (conversationId)
    await request(`/api/conversations/${conversationId}`, {
      method: "DELETE",
    }).catch(() => {});
  if (botId)
    await request(`/api/chatbots/${botId}`, { method: "DELETE" }).catch(
      () => {},
    );
  await prisma.$disconnect();
}
