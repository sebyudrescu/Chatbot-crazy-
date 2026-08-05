import "server-only";

import { prisma } from "./db";
import {
  operationalErrorFingerprint,
  redactOperationalText,
  sanitizeRequestPath,
} from "./operational-error-safety";

type RequestErrorContext = {
  routerKind: string;
  routePath: string;
  routeType: string;
  renderSource?: string;
  revalidateReason?: string;
  renderType?: string;
};

export async function recordUnhandledRequestError(input: {
  error: Error & { digest?: string };
  request: { path: string; method: string };
  context: RequestErrorContext;
}) {
  const requestPath = sanitizeRequestPath(input.request.path);
  const routePath = sanitizeRequestPath(input.context.routePath);
  const message = redactOperationalText(input.error.message || "Errore server non gestito", 500);
  const digest = redactOperationalText(input.error.digest || "", 100);
  const fingerprint = operationalErrorFingerprint(message, routePath, digest);

  await prisma.event.create({
    data: {
      eventType: "system.request.unhandled",
      category: "system",
      severity: "error",
      success: false,
      errorMessage: message,
      errorStack: redactOperationalText(input.error.stack || "", 4_000) || null,
      metadata: JSON.stringify({
        fingerprint,
        digest: digest || undefined,
        method: input.request.method.slice(0, 12).toUpperCase(),
        requestPath,
        routePath,
        routeType: input.context.routeType,
        routerKind: input.context.routerKind,
        renderSource: input.context.renderSource,
        renderType: input.context.renderType,
        deployment: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12),
      }),
    },
  });
}
