import type { ActionType } from "./action-schema";
import { safeHttpsUrl } from "./integration-catalog";

interface SimulationInput {
  type: ActionType;
  triggerKeywords: string[];
  config: Record<string, string>;
  message: string;
}

export interface ActionSimulation {
  matched: boolean;
  effect: string;
  extracted: Record<string, string>;
  safePreview: true;
}

export function simulateAction(input: SimulationInput): ActionSimulation {
  const normalized = input.message.toLocaleLowerCase("it");
  const matched = input.triggerKeywords.some((keyword) =>
    normalized.includes(keyword.toLocaleLowerCase("it")),
  );
  if (!matched) {
    return {
      matched: false,
      effect: "Nessuna parola di attivazione trovata",
      extracted: {},
      safePreview: true,
    };
  }

  if (input.type === "booking_link") {
    const url = safeHttpsUrl(input.config.url || "");
    return {
      matched: true,
      effect: url
        ? `Mostrerebbe il pulsante “${input.config.label || "Prenota appuntamento"}”`
        : "Il link di prenotazione non è valido",
      extracted: url ? { url: url.toString() } : {},
      safePreview: true,
    };
  }
  if (input.type === "handoff") {
    return {
      matched: true,
      effect: `Passerebbe la conversazione a un operatore: ${input.config.reason || "Richiesta operatore"}`,
      extracted: {},
      safePreview: true,
    };
  }
  if (input.type === "collect_lead") {
    const email = input.message.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0];
    const phone = input.message.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0]?.trim();
    const extracted = {
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
    };
    return {
      matched: true,
      effect: Object.keys(extracted).length
        ? "Salverebbe i dati di contatto trovati"
        : "Mostrerebbe un modulo guidato per nome, email, telefono e azienda",
      extracted,
      safePreview: true,
    };
  }

  const url = safeHttpsUrl(input.config.url || "");
  return {
    matched: true,
    effect: url
      ? `Inviererebbe un POST a ${url.toString()} (richiesta non inviata)`
      : "Endpoint webhook non valido",
    extracted: {},
    safePreview: true,
  };
}
