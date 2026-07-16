import type { WorkflowStepInput } from "./workflow-schema";

interface SimulationInput {
  triggerType: "new_message" | "intent" | "keyword" | "manual";
  steps: WorkflowStepInput[];
  message: string;
  intent?: string;
  sentiment?: string;
}

export interface WorkflowSimulation {
  matched: boolean;
  actions: string[];
  responsePreview?: string;
  steps: Array<{
    id: string;
    title: string;
    status: "matched" | "planned" | "skipped";
    detail: string;
  }>;
}

function matches(value: string, operator: string, expected: string) {
  const actual = value.toLocaleLowerCase("it");
  const target = expected.toLocaleLowerCase("it");
  if (operator === "equals") return actual === target;
  if (operator === "not_contains") return !actual.includes(target);
  return actual.includes(target);
}

export function simulateWorkflow(input: SimulationInput): WorkflowSimulation {
  let allowed =
    input.triggerType === "new_message" || input.triggerType === "manual";
  let responsePreview: string | undefined;
  const actions: string[] = [];
  const steps: WorkflowSimulation["steps"] = [];

  for (const step of input.steps) {
    if (step.type === "condition") {
      const field = String(step.config.field || "message");
      const source =
        field === "intent"
          ? input.intent || ""
          : field === "sentiment"
            ? input.sentiment || ""
            : input.message;
      allowed = matches(
        source,
        String(step.config.operator || "contains"),
        String(step.config.value || ""),
      );
      steps.push({
        id: step.id,
        title: step.title,
        status: allowed ? "matched" : "skipped",
        detail: allowed ? "Condizione verificata" : "Condizione non verificata",
      });
      if (!allowed) break;
      continue;
    }
    if (!allowed) {
      steps.push({
        id: step.id,
        title: step.title,
        status: "skipped",
        detail: "Trigger non verificato",
      });
      break;
    }

    let detail = "Passaggio simulato";
    if (step.type === "message") {
      responsePreview = String(step.config.content || "").trim();
      actions.push("message");
      detail = responsePreview || "Messaggio vuoto";
    } else if (step.type === "collect") {
      actions.push(`collect:${String(step.config.field || "email")}`);
      detail = `Cercherebbe il campo ${String(step.config.field || "email")}`;
    } else if (step.type === "handoff") {
      actions.push("handoff");
      detail = "Passerebbe la conversazione a un operatore";
    } else if (step.type === "tag") {
      actions.push(`tag:${String(step.config.tag || "")}`);
      detail = `Aggiungerebbe il tag ${String(step.config.tag || "")}`;
    } else if (step.type === "webhook") {
      actions.push("webhook");
      detail = `Chiamerebbe ${String(step.config.url || "")} (richiesta non inviata)`;
    } else if (step.type === "end") {
      detail = "Terminerebbe il workflow";
    }
    steps.push({ id: step.id, title: step.title, status: "planned", detail });
    if (step.type === "end") break;
  }

  return {
    matched: allowed && actions.length > 0,
    actions,
    responsePreview,
    steps,
  };
}
