import "server-only";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function eventTitle(event: string) {
  if (event === "lead.captured") return "Nuovo lead acquisito";
  if (event === "conversation.handoff_requested") return "Conversazione da gestire";
  if (event === "system.request.unhandled") return "Errore server critico";
  return "Nuovo evento LitX";
}

export interface EmailNotificationResult {
  success: boolean;
  status: number | null;
  id?: string;
  error: string;
}

export async function deliverEmailNotification(input: {
  to: string;
  event: string;
  agentName: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  subscribedEvents?: string[];
}): Promise<EmailNotificationResult> {
  if (input.subscribedEvents?.length && !input.subscribedEvents.includes(input.event)) {
    return { success: true, status: 204, error: "" };
  }
  const apiKey = process.env.RESEND_API_KEY || "";
  const from = process.env.RESEND_FROM_EMAIL || "";
  if (!apiKey || !from) return { success: false, status: null, error: "Configura RESEND_API_KEY e RESEND_FROM_EMAIL" };
  if (!EMAIL.test(input.to)) return { success: false, status: null, error: "Email destinatario non valida" };

  const appUrl = (() => {
    try { return new URL(process.env.NEXT_PUBLIC_APP_URL || "").origin; }
    catch { return ""; }
  })();
  const conversationId = typeof input.payload.conversationId === "string" ? input.payload.conversationId : "";
  const detailUrl = appUrl && conversationId
    ? `${appUrl}/conversations?conversation=${encodeURIComponent(conversationId)}`
    : appUrl && input.event === "system.request.unhandled" ? `${appUrl}/settings` : "";
  const visibleKeys = ["name", "email", "phone", "company", "reason", "assignedAgent", "conversationId", "message", "method", "requestPath", "routePath", "fingerprint", "deployment"];
  const rows = visibleKeys.flatMap(key => input.payload[key] === null || input.payload[key] === undefined || input.payload[key] === "" ? [] : [
    `<tr><td style="padding:8px 12px;color:#667085;border-bottom:1px solid #eef0f4">${escapeHtml(key)}</td><td style="padding:8px 12px;color:#101828;border-bottom:1px solid #eef0f4">${escapeHtml(input.payload[key])}</td></tr>`,
  ]).join("");
  const title = eventTitle(input.event);
  const html = `<!doctype html><html><body style="margin:0;background:#f5f6fa;font-family:Arial,sans-serif;color:#101828"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(title)} per ${escapeHtml(input.agentName)}</div><div style="max-width:600px;margin:32px auto;background:#fff;border:1px solid #e7e9ee;border-radius:16px;overflow:hidden"><div style="padding:24px;background:#111827;color:#fff"><div style="font-size:12px;color:#c4b5fd;text-transform:uppercase;letter-spacing:.08em">LitX AI</div><h1 style="font-size:22px;margin:8px 0 0">${escapeHtml(title)}</h1></div><div style="padding:24px"><p style="margin:0 0 18px;color:#475467">Agente: <strong>${escapeHtml(input.agentName)}</strong></p>${rows ? `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>` : ""}${detailUrl ? `<p style="margin:24px 0 0"><a href="${escapeHtml(detailUrl)}" style="display:inline-block;background:#633cff;color:#fff;text-decoration:none;padding:12px 18px;border-radius:9px;font-weight:700">Apri conversazione</a></p>` : ""}<p style="margin:24px 0 0;font-size:12px;color:#98a2b3">Messaggio operativo generato automaticamente da LitX AI.</p></div></div></body></html>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey.slice(0, 256),
    },
    body: JSON.stringify({ from, to: [input.to], subject: `${title} · ${input.agentName}`.replace(/[\r\n]/g, " ").slice(0, 180), html }),
    signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json().catch(() => ({})) as { id?: string; message?: string; error?: { message?: string } };
  return response.ok
    ? { success: true, status: response.status, id: result.id, error: "" }
    : { success: false, status: response.status, error: result.error?.message || result.message || `Resend HTTP ${response.status}` };
}
