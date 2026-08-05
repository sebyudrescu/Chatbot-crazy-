import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { recordUnhandledRequestError } = await import("./lib/error-observability");
    const normalizedError = error instanceof Error
      ? error as Error & { digest?: string }
      : new Error("Errore server non gestito");
    await recordUnhandledRequestError({ error: normalizedError, request, context });
  } catch (observabilityError) {
    console.error("[Observability] Unable to persist unhandled request error", observabilityError);
  }
};
