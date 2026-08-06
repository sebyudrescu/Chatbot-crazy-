import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { constantTimeEqual } from "@/lib/auth-token";
import { runCommerceSyncWorker } from "@/lib/commerce-sync-worker";

const schema = z.object({ jobId: z.string().uuid() });

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET || "";
  const received = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!expected || !constantTimeEqual(received, expected)) {
    return NextResponse.json({ success: false, error: "Non autorizzato" }, { status: 401 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Job non valido" }, { status: 400 });
  after(async () => { await runCommerceSyncWorker(parsed.data.jobId); });
  return NextResponse.json({ success: true }, { status: 202 });
}
