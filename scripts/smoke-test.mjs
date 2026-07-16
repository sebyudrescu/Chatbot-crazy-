const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000";
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

await authenticate();

try {
  const health = await request("/api/health");
  assert(
    health.status === "healthy" || health.success !== false,
    "Health check failed",
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
        aiModel: "gpt-3.5-turbo",
        temperature: 0.2,
        maxTokens: 256,
        rules: ["Non inventare"],
      },
    }),
  });
  botId = created.data.id;
  assert(
    botId && created.data.systemPrompt === "System prompt smoke test",
    "Chatbot creation failed",
  );
  assert(created.data.isActive === false, "New agents must start as drafts");
  assert(
    created.data.settings.aiModel === "gpt-4o-mini",
    "Legacy AI model was not normalized",
  );
  const initialReadiness = await request(`/api/chatbots/${botId}/readiness`);
  assert(
    initialReadiness.data.ready === false && initialReadiness.data.total === 5,
    "Agent readiness checklist failed",
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
      widgetSource.includes("chatbot-feedback"),
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
      userEmail: "smoke@example.com",
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
  const detail = await request(`/api/conversations/${conversationId}`);
  assert(
    detail.data.userName === "Smoke Client" &&
      detail.data.messages.at(-1)?.content === "Risposta smoke" &&
      detail.data.messages.at(-1)?.feedback === "positive" &&
      detail.data.internalNotes === "Nota operativa smoke" &&
      detail.data.tags.includes("urgente"),
    "Inbox and public widget feedback flow failed",
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
  const evaluations = await request(`/api/evaluations?botId=${botId}`);
  assert(
    evaluations.data[0].runs[0].passed === true,
    "Evaluation history failed",
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
    `/api/suggestions?botId=${botId}&status=pending`,
  );
  assert(
    suggestions.data.some((item) => item.category === "knowledge"),
    "Suggestion engine failed",
  );

  console.log(
    JSON.stringify(
      {
        success: true,
        checks: [
          "health",
          "agent",
          "settings",
          "prompt-versions",
          "knowledge-preview",
          "widget",
          "widget-feedback",
          "widget-cors",
          "conversation-isolation",
          "embed",
          "inbox-notes-tags",
          ...(process.env.SMOKE_AI_ASSIST === "true"
            ? ["helpdesk-ai", "ai-usage-costs"]
            : []),
          "crm",
          "workflow",
          "evaluations",
          "integrations",
          "actions",
          "agent-backup",
          "agent-clone",
          "agent-restore",
          "search",
          "suggestions",
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
}
