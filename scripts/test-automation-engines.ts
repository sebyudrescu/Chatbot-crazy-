import { prisma } from "../lib/db";
import { runActiveWorkflows } from "../lib/workflow-engine";
import { runTriggeredActions } from "../lib/action-engine";
import { simulateWorkflow } from "../lib/workflow-simulator";
import { simulateAction } from "../lib/action-simulator";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  deliverWebhook,
  verifyWebhookSignature,
} from "../lib/webhook-delivery";
import {
  getOperationalHealth,
  retryFailedIngestionJob,
} from "../lib/operational-health";
import { getAgentReadiness } from "../lib/agent-readiness";
import { getDeploymentReadiness } from "../lib/deployment-readiness";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function testWebhookDelivery() {
  const secret = "automation-test-secret-123456";
  let attempts = 0;
  let deliveredBody = "";
  let deliveredSignature = "";
  let deliveredTimestamp = "";
  let deliveredIdempotencyKey = "";
  const server = createServer((request, response) => {
    attempts += 1;
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      deliveredBody = body;
      deliveredSignature = String(request.headers["x-litx-signature"] || "");
      deliveredTimestamp = String(request.headers["x-litx-timestamp"] || "");
      deliveredIdempotencyKey = String(request.headers["idempotency-key"] || "");
      response.writeHead(attempts === 1 ? 503 : 200, {
        "Content-Type": "application/json",
      });
      response.end(JSON.stringify({ received: true }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string", "Webhook fixture did not start");
  process.env.ALLOW_PRIVATE_WEBHOOK_FOR_TESTS = "true";
  try {
    const result = await deliverWebhook({
      url: `http://127.0.0.1:${address.port}/events`,
      event: "automation.test",
      payload: { leadId: "lead-test" },
      secret,
      idempotencyKey: "automation-delivery-key",
      timeoutMs: 2000,
      maxAttempts: 3,
      retryBaseMs: 5,
    });
    assert(result.success, "Webhook did not recover after a temporary error");
    assert(result.attempts === 2, "Webhook retry count is incorrect");
    assert(
      deliveredIdempotencyKey === "automation-delivery-key",
      "Webhook idempotency header is missing",
    );
    assert(
      verifyWebhookSignature({
        secret,
        timestamp: deliveredTimestamp,
        body: deliveredBody,
        signature: deliveredSignature,
      }),
      "Webhook HMAC signature is invalid",
    );
  } finally {
    delete process.env.ALLOW_PRIVATE_WEBHOOK_FOR_TESTS;
    server.close();
    await once(server, "close");
  }
}

async function testAgentPublicationReadiness() {
  const bot = await prisma.chatbot.create({
    data: {
      companyName: "Readiness test",
      systemPrompt: "Rispondi solo usando le fonti approvate.",
      settings: JSON.stringify({
        role: "Assistente clienti",
        objective: "Rispondere alle richieste verificate",
      }),
      kbStatus: "ready",
      kbTotalChunks: 1,
    },
  });
  try {
    await prisma.embedSettings.create({
      data: { chatbotId: bot.id, enabled: true },
    });
    await prisma.knowledgeSource.create({
      data: {
        botId: bot.id,
        sourceType: "url",
        sourceUrl: "https://example.com/help",
        contentText: "Contenuto verificato per la prova di pubblicazione.",
        status: "completed",
        chunkCount: 1,
      },
    });
    const conversation = await prisma.conversation.create({
      data: { botId: bot.id, userSessionId: "readiness-test" },
    });
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: "Come funziona il servizio?",
      },
    });
    const evaluationCase = await prisma.evaluationCase.create({
      data: {
        botId: bot.id,
        name: "Risposta verificata",
        question: "Come funziona il servizio?",
        expectedKeywords: "[]",
        forbiddenKeywords: "[]",
      },
    });
    await prisma.evaluationRun.create({
      data: {
        caseId: evaluationCase.id,
        passed: true,
        response: "Risposta precedente",
        createdAt: new Date(Date.now() - 60_000),
      },
    });
    const configurationChangedAt = new Date();
    await prisma.promptVersion.create({
      data: {
        botId: bot.id,
        version: 1,
        systemPrompt: bot.systemPrompt,
        settings: bot.settings || "{}",
        changeSummary: "Configurazione aggiornata",
        createdAt: configurationChangedAt,
      },
    });

    const stale = await getAgentReadiness(bot.id);
    assert(
      stale?.checks.find((check) => check.key === "conversation")?.done ===
        false,
      "Readiness accepted a conversation without an assistant response",
    );
    assert(
      stale?.checks.find((check) => check.key === "evaluations")?.done ===
        false,
      "Readiness accepted evaluations older than the prompt configuration",
    );

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: "Il servizio usa informazioni verificate.",
      },
    });
    await prisma.evaluationRun.create({
      data: {
        caseId: evaluationCase.id,
        passed: true,
        response: "Risposta aggiornata",
        createdAt: new Date(configurationChangedAt.getTime() + 1_000),
      },
    });
    const ready = await getAgentReadiness(bot.id);
    assert(ready?.ready === true, "Valid agent was not publication-ready");
  } finally {
    await prisma.chatbot.delete({ where: { id: bot.id } });
  }
}

async function main() {
  const databaseUrl = new URL(process.env.DATABASE_URL || "");
  assert(
    databaseUrl.searchParams.get("schema") === "codex_automation_test",
    "Automation tests refuse to run outside the isolated codex_automation_test schema",
  );
  const deployable = getDeploymentReadiness({
    DATABASE_URL: "postgresql://user:password@example.com:5432/app",
    OPENAI_API_KEY: "sk-production-key-with-enough-entropy",
    APP_ACCESS_PASSWORD: "owner-password-with-entropy",
    APP_AUTH_SALT: "session-signing-salt-with-32-characters",
    CRON_SECRET: "cron-signing-secret-with-32-characters",
    NEXT_PUBLIC_APP_URL: "https://agents.example.com",
  });
  assert(deployable.ready, "Valid production environment was not accepted");
  const unsafeDeployment = getDeploymentReadiness({
    DATABASE_URL: "file:./dev.db",
    OPENAI_API_KEY: "sk-your-api-key-here",
    APP_ACCESS_PASSWORD: "short",
    APP_AUTH_SALT: "replace-me",
    CRON_SECRET: "change-me",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  });
  assert(
    !unsafeDeployment.ready && unsafeDeployment.missing.length === 6,
    "Unsafe production environment was not rejected",
  );
  await testWebhookDelivery();
  await testAgentPublicationReadiness();

  const simulation = simulateWorkflow({
    triggerType: "keyword",
    message: "Vorrei un preventivo",
    steps: [
      {
        id: "condition",
        type: "condition",
        title: "Preventivo",
        config: { field: "message", operator: "contains", value: "preventivo" },
      },
      {
        id: "webhook",
        type: "webhook",
        title: "Invia lead",
        config: { url: "https://example.com/webhook", method: "POST" },
      },
    ],
  });
  assert(simulation.matched, "Workflow simulation did not match");
  assert(
    simulation.actions.includes("webhook"),
    "Workflow simulation omitted the planned action",
  );
  assert(
    simulation.steps.some((step) => step.detail.includes("non inviata")),
    "Workflow simulation did not mark external effects as disabled",
  );
  const actionSimulation = simulateAction({
    type: "collect_lead",
    triggerKeywords: ["contatto"],
    config: {},
    message: "Ecco il mio contatto: luca@example.com",
  });
  assert(actionSimulation.matched, "Action simulation did not match");
  assert(
    actionSimulation.extracted.email === "luca@example.com",
    "Action simulation did not extract the email",
  );

  const bot = await prisma.chatbot.create({
    data: { companyName: "Automation engine test" },
  });
  try {
    const failedJob = await prisma.ingestionJob.create({
      data: {
        botId: bot.id,
        jobType: "url",
        params: JSON.stringify({ singleUrl: "https://example.com/help" }),
        status: "failed",
        attempts: 5,
        maxAttempts: 5,
        errorMessage: "Controlled operational monitor failure",
        completedAt: new Date(),
      },
    });
    const unhealthy = await getOperationalHealth();
    assert(
      unhealthy.incidents.some((incident) => incident.id === failedJob.id),
      "Operational monitor omitted a failed ingestion job",
    );
    const retriedJob = await retryFailedIngestionJob(failedJob.id);
    assert(
      retriedJob.status === "pending" &&
        retriedJob.attempts === 0 &&
        retriedJob.errorMessage === null,
      "Manual ingestion retry did not reset the failed job",
    );

    const conversation = await prisma.conversation.create({
      data: { botId: bot.id, userSessionId: `automation-${Date.now()}` },
    });
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: "Mi chiamo Luca, vorrei parlare con una persona",
      },
    });
    const workflow = await prisma.workflow.create({
      data: {
        botId: bot.id,
        name: "Handoff test",
        isActive: true,
        steps: JSON.stringify([
          {
            id: "condition",
            type: "condition",
            title: "Richiesta operatore",
            config: {
              field: "message",
              operator: "contains",
              value: "persona",
            },
          },
          {
            id: "collect",
            type: "collect",
            title: "Raccogli nome",
            config: { field: "name" },
          },
          {
            id: "handoff",
            type: "handoff",
            title: "Passa a operatore",
            config: { reason: "Test automatico" },
          },
        ]),
      },
    });

    const workflowContext = {
      botId: bot.id,
      conversationId: conversation.id,
      messageId: message.id,
      message: message.content,
    };
    const firstWorkflowRun = await runActiveWorkflows(workflowContext);
    const repeatedWorkflowRun = await runActiveWorkflows(workflowContext);
    assert(
      firstWorkflowRun.executed.includes(workflow.id),
      "Workflow did not execute",
    );
    assert(
      repeatedWorkflowRun.skipped.includes(workflow.id),
      "Workflow retry was not skipped",
    );

    const workflowExecutions = await prisma.workflowExecution.findMany({
      where: { workflowId: workflow.id },
    });
    assert(
      workflowExecutions.length === 1,
      "Workflow idempotency record is not unique",
    );
    assert(
      workflowExecutions[0].status === "success",
      "Workflow success was not logged",
    );

    const action = await prisma.agentAction.create({
      data: {
        botId: bot.id,
        name: "Handoff action test",
        type: "handoff",
        triggerKeywords: JSON.stringify(["persona"]),
        config: JSON.stringify({ reason: "Test action" }),
      },
    });
    const actionContext = {
      botId: bot.id,
      conversationId: conversation.id,
      messageId: message.id,
      message: message.content,
    };
    const firstActionRun = await runTriggeredActions(actionContext);
    const repeatedActionRun = await runTriggeredActions(actionContext);
    assert(
      firstActionRun.executed.includes(action.id),
      "Action did not execute",
    );
    assert(
      repeatedActionRun.skipped.includes(action.id),
      "Action retry was not skipped",
    );

    const actionExecutions = await prisma.actionExecution.findMany({
      where: { actionId: action.id },
    });
    assert(
      actionExecutions.length === 1,
      "Action idempotency record is not unique",
    );
    assert(actionExecutions[0].success, "Action success was not logged");
    assert(
      actionExecutions[0].status === "success",
      "Action status was not finalized",
    );

    const leadAction = await prisma.agentAction.create({
      data: {
        botId: bot.id,
        name: "Lead form test",
        type: "collect_lead",
        triggerKeywords: JSON.stringify(["richiamami"]),
        config: JSON.stringify({ title: "Richiedi un contatto" }),
      },
    });
    const leadMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: "Richiamami per maggiori informazioni",
      },
    });
    const leadResult = await runTriggeredActions({
      botId: bot.id,
      conversationId: conversation.id,
      messageId: leadMessage.id,
      message: leadMessage.content,
    });
    assert(
      leadResult.executed.includes(leadAction.id) &&
        leadResult.leadForms[0]?.title === "Richiedi un contatto",
      "Lead action did not return the guided form",
    );

    const updatedConversation = await prisma.conversation.findUnique({
      where: { id: conversation.id },
    });
    assert(
      updatedConversation?.userName === "Luca",
      "Workflow did not collect the name",
    );
    assert(
      updatedConversation?.needsHumanEscalation,
      "Handoff was not persisted",
    );

    console.log("automation engines: ok");
  } finally {
    await prisma.chatbot.delete({ where: { id: bot.id } });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
