import "server-only";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function accountEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

export async function sendEmailVerification(input: { to: string; verificationUrl: string; idempotencyKey: string }) {
  const apiKey = process.env.RESEND_API_KEY || "";
  const from = process.env.RESEND_FROM_EMAIL || "";
  if (!apiKey || !from || !EMAIL.test(input.to)) return { success: false, error: "Email account non configurata" };
  const url = new URL(input.verificationUrl);
  if (url.protocol !== "https:" && process.env.NODE_ENV === "production") return { success: false, error: "URL verifica non sicuro" };
  const html = `<!doctype html><html><body style="margin:0;background:#f5f6fa;font-family:Arial,sans-serif;color:#101828"><div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #e7e9ee;border-radius:16px;overflow:hidden"><div style="padding:24px;background:#111827;color:#fff"><div style="font-size:12px;color:#c4b5fd;text-transform:uppercase;letter-spacing:.08em">LitX AI</div><h1 style="font-size:22px;margin:8px 0 0">Verifica la tua email</h1></div><div style="padding:24px"><p style="margin:0;color:#475467;line-height:1.6">Conferma l’indirizzo email per attivare il workspace aziendale. Il link è personale, monouso e scade tra 24 ore.</p><p style="margin:24px 0"><a href="${escapeHtml(url.toString())}" style="display:inline-block;background:#633cff;color:#fff;text-decoration:none;padding:12px 18px;border-radius:9px;font-weight:700">Verifica e attiva account</a></p><p style="margin:0;font-size:12px;color:#98a2b3">Se non hai creato tu questo account, ignora questa email.</p></div></div></body></html>`;
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": input.idempotencyKey.slice(0, 256) }, body: JSON.stringify({ from, to: [input.to], subject: "Verifica il tuo account · LitX AI", html }), signal: AbortSignal.timeout(10_000) });
  return response.ok ? { success: true, error: "" } : { success: false, error: `Resend HTTP ${response.status}` };
}

export async function sendPasswordResetEmail(input: { to: string; resetUrl: string; idempotencyKey: string }) {
  const apiKey = process.env.RESEND_API_KEY || "";
  const from = process.env.RESEND_FROM_EMAIL || "";
  if (!apiKey || !from || !EMAIL.test(input.to)) return { success: false, error: "Email account non configurata" };
  const url = new URL(input.resetUrl);
  if (url.protocol !== "https:" && process.env.NODE_ENV === "production") return { success: false, error: "URL reset non sicuro" };
  const html = `<!doctype html><html><body style="margin:0;background:#f5f6fa;font-family:Arial,sans-serif;color:#101828"><div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #e7e9ee;border-radius:16px;overflow:hidden"><div style="padding:24px;background:#111827;color:#fff"><div style="font-size:12px;color:#c4b5fd;text-transform:uppercase;letter-spacing:.08em">LitX AI</div><h1 style="font-size:22px;margin:8px 0 0">Reimposta la password</h1></div><div style="padding:24px"><p style="margin:0;color:#475467;line-height:1.6">È stata richiesta una nuova password per il tuo account. Il link scade tra 30 minuti e può essere usato una sola volta.</p><p style="margin:24px 0"><a href="${escapeHtml(url.toString())}" style="display:inline-block;background:#633cff;color:#fff;text-decoration:none;padding:12px 18px;border-radius:9px;font-weight:700">Scegli una nuova password</a></p><p style="margin:0;font-size:12px;color:#98a2b3">Se non hai effettuato tu la richiesta, ignora questa email. La password attuale resta valida.</p></div></div></body></html>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": input.idempotencyKey.slice(0, 256) },
    body: JSON.stringify({ from, to: [input.to], subject: "Reimposta la password · LitX AI", html }),
    signal: AbortSignal.timeout(10_000),
  });
  return response.ok ? { success: true, error: "" } : { success: false, error: `Resend HTTP ${response.status}` };
}

export async function sendWorkspaceInvitationEmail(input: {
  to: string;
  workspaceName: string;
  role: string;
  invitationUrl: string;
  expiresInHours: number;
  idempotencyKey: string;
}) {
  const apiKey = process.env.RESEND_API_KEY || "";
  const from = process.env.RESEND_FROM_EMAIL || "";
  if (!apiKey || !from || !EMAIL.test(input.to)) return { success: false, error: "Email account non configurata" };
  const url = new URL(input.invitationUrl);
  if (url.protocol !== "https:" && process.env.NODE_ENV === "production") return { success: false, error: "URL invito non sicuro" };
  const workspaceName = escapeHtml(input.workspaceName);
  const role = escapeHtml(input.role);
  const html = `<!doctype html><html><body style="margin:0;background:#f5f6fa;font-family:Arial,sans-serif;color:#101828"><div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #e7e9ee;border-radius:16px;overflow:hidden"><div style="padding:24px;background:#111827;color:#fff"><div style="font-size:12px;color:#c4b5fd;text-transform:uppercase;letter-spacing:.08em">LitX AI</div><h1 style="font-size:22px;margin:8px 0 0">Accedi al tuo chatbot</h1></div><div style="padding:24px"><p style="margin:0;color:#475467;line-height:1.6">Sei stato invitato nel workspace <strong>${workspaceName}</strong> con ruolo <strong>${role}</strong>. Attiva il tuo account per consultare il chatbot e i dati autorizzati.</p><p style="margin:24px 0"><a href="${escapeHtml(url.toString())}" style="display:inline-block;background:#633cff;color:#fff;text-decoration:none;padding:12px 18px;border-radius:9px;font-weight:700">Attiva il tuo account</a></p><p style="margin:0;font-size:12px;color:#98a2b3">Il link è personale, monouso e scade tra ${input.expiresInHours} ore. Se non aspettavi questo invito, puoi ignorare l’email.</p></div></div></body></html>`;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": input.idempotencyKey.slice(0, 256) },
      body: JSON.stringify({ from, to: [input.to], subject: `Invito a ${input.workspaceName.replace(/[\r\n]+/g, " ")} · LitX AI`, html }),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok ? { success: true, error: "" } : { success: false, error: `Resend HTTP ${response.status}` };
  } catch {
    return { success: false, error: "Servizio email non raggiungibile" };
  }
}
