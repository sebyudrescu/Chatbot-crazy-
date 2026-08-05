import "server-only";
import { prisma } from "@/lib/db";
import { deliverEmailNotification } from "@/lib/email-notifications";
import { systemErrorAlertKey } from "@/lib/system-error-alert-policy";

interface SystemErrorAlertInput {
  fingerprint: string;
  message: string;
  method: string;
  requestPath: string;
  routePath: string;
  deployment?: string;
}

export async function deliverSystemErrorAlert(input: SystemErrorAlertInput) {
  const recipient = process.env.OPERATIONS_ALERT_EMAIL || "";
  if (!recipient || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return { success: false, skipped: true, deduplicated: false, error: "Alert email non configurato" };
  }

  const key = systemErrorAlertKey(input.fingerprint);
  try {
    await prisma.notificationState.create({ data: { key } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return { success: true, skipped: true, deduplicated: true, error: "" };
    }
    return { success: false, skipped: false, deduplicated: false, error: "Impossibile prenotare l'alert" };
  }

  try {
    const result = await deliverEmailNotification({
      to: recipient,
      event: "system.request.unhandled",
      agentName: "Piattaforma LitX",
      payload: {
        message: input.message,
        method: input.method,
        requestPath: input.requestPath,
        routePath: input.routePath,
        fingerprint: input.fingerprint,
        deployment: input.deployment,
      },
      idempotencyKey: key,
    });
    if (!result.success) await prisma.notificationState.deleteMany({ where: { key } });
    return { ...result, skipped: false, deduplicated: false };
  } catch {
    await prisma.notificationState.deleteMany({ where: { key } }).catch(() => undefined);
    return { success: false, skipped: false, deduplicated: false, error: "Invio alert non riuscito" };
  } finally {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await prisma.notificationState.deleteMany({ where: { key: { startsWith: "system-email:" }, createdAt: { lt: cutoff } } }).catch(() => undefined);
  }
}
