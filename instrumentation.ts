import type { Instrumentation } from "next";
import {
  redactOperationalText,
  sanitizeRequestPath,
} from "./lib/operational-error-safety";

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const secret = process.env.CRON_SECRET;
    const requestPath = sanitizeRequestPath(request.path);
    if (!appUrl || !secret || requestPath === "/api/internal/observability") return;
    const normalizedError: Error & { digest?: string } = error instanceof Error
      ? error as Error & { digest?: string }
      : new Error("Errore server non gestito");
    const response = await fetch(new URL("/api/internal/observability", appUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: redactOperationalText(normalizedError.message, 500),
        stack: redactOperationalText(normalizedError.stack || "", 4_000),
        digest: redactOperationalText(normalizedError.digest || "", 100),
        method: request.method,
        requestPath,
        routePath: sanitizeRequestPath(context.routePath),
        routeType: context.routeType,
        routerKind: context.routerKind,
        renderSource: context.renderSource,
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) console.error(`[Observability] Collector returned HTTP ${response.status}`);
  } catch (observabilityError) {
    console.error("[Observability] Unable to report unhandled request error", observabilityError);
  }
};
