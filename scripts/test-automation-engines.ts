import { prisma } from "../lib/db";
import { runActiveWorkflows } from "../lib/workflow-engine";
import { runTriggeredActions } from "../lib/action-engine";
import { simulateWorkflow } from "../lib/workflow-simulator";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const databaseUrl = new URL(process.env.DATABASE_URL || "");
  assert(
    databaseUrl.searchParams.get("schema") === "codex_automation_test",
    "Automation tests refuse to run outside the isolated codex_automation_test schema",
  );

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

  const bot = await prisma.chatbot.create({
    data: { companyName: "Automation engine test" },
  });
  try {
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
