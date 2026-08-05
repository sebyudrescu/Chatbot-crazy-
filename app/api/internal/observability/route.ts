import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { constantTimeEqual } from "@/lib/auth-token";
import { prisma } from "@/lib/db";
import {
  operationalErrorFingerprint,
  redactOperationalText,
  sanitizeRequestPath,
} from "@/lib/operational-error-safety";

const ReportSchema = z.object({
  message: z.string().max(500),
  stack: z.string().max(4_000).optional(),
  digest: z.string().max(100).optional(),
  method: z.string().max(12),
  requestPath: z.string().max(300),
  routePath: z.string().max(300),
  routeType: z.string().max(50),
  routerKind: z.string().max(50),
  renderSource: z.string().max(80).optional(),
  renderType: z.string().max(50).optional(),
});

const noStore = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "private, no-store" },
});

export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET || "";
  const authorization = request.headers.get("authorization") || "";
  const received = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!expected || !received || !constantTimeEqual(received, expected)) {
    return noStore({ success: false, error: "Accesso non autorizzato" }, 401);
  }

  try {
    const input = ReportSchema.parse(await request.json());
    const requestPath = sanitizeRequestPath(input.requestPath);
    const routePath = sanitizeRequestPath(input.routePath);
    const message = redactOperationalText(input.message || "Errore server non gestito", 500);
    const digest = redactOperationalText(input.digest || "", 100);
    const fingerprint = operationalErrorFingerprint(message, routePath, digest);
    const event = await prisma.event.create({
      data: {
        eventType: "system.request.unhandled",
        category: "system",
        severity: "error",
        success: false,
        errorMessage: message,
        errorStack: redactOperationalText(input.stack || "", 4_000) || null,
        metadata: JSON.stringify({
          fingerprint,
          digest: digest || undefined,
          method: input.method.slice(0, 12).toUpperCase(),
          requestPath,
          routePath,
          routeType: redactOperationalText(input.routeType, 50),
          routerKind: redactOperationalText(input.routerKind, 50),
          renderSource: redactOperationalText(input.renderSource || "", 80) || undefined,
          renderType: redactOperationalText(input.renderType || "", 50) || undefined,
          deployment: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12),
        }),
      },
      select: { id: true },
    });
    return noStore({ success: true, id: event.id }, 201);
  } catch (error) {
    console.error("[Observability] Unable to persist error report", error);
    return noStore({ success: false, error: "Report operativo non valido" }, 400);
  }
}
