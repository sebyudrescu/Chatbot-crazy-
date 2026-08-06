import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  drainCommerceSyncJob,
  enqueueCommerceSync,
  getCommerceSyncJob,
  getLatestCommerceSyncJob,
  recoverStaleCommerceSyncJobs,
  serializeCommerceSyncJob,
} from "@/lib/commerce-sync-queue";

const schema = z.object({ botId: z.string().uuid(), provider: z.enum(["shopify", "woocommerce"]) });
const querySchema = z.union([
  z.object({ jobId: z.string().uuid(), botId: z.undefined().optional(), provider: z.undefined().optional() }),
  z.object({ jobId: z.undefined().optional(), botId: z.string().uuid(), provider: z.enum(["shopify", "woocommerce"]) }),
]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function schedule(job: { id: string; status: string; nextRetryAt: Date | null }) {
  if (job.status === "pending" && (!job.nextRetryAt || job.nextRetryAt <= new Date())) {
    after(async () => { await drainCommerceSyncJob(job.id); });
  }
}

function publicSyncError(error: unknown) {
  console.error("[Commerce sync]", error);
  const message = error instanceof Error ? error.message : "";
  return /non è collegato|è disattivato|ricollega il negozio|Dominio Shopify non valido/i.test(message)
    ? message
    : "Impossibile avviare la sincronizzazione. Riprova tra poco.";
}

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Richiesta sync non valida" }, { status: 400 });
  try {
    await recoverStaleCommerceSyncJobs();
    const { job, reused } = await enqueueCommerceSync(parsed.data.botId, parsed.data.provider);
    schedule(job);
    return NextResponse.json({ success: true, data: serializeCommerceSyncJob(job), reused }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ success: false, error: publicSyncError(error) }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    jobId: request.nextUrl.searchParams.get("jobId") || undefined,
    botId: request.nextUrl.searchParams.get("botId") || undefined,
    provider: request.nextUrl.searchParams.get("provider") || undefined,
  });
  if (!parsed.success) return NextResponse.json({ success: false, error: "Richiesta stato sync non valida" }, { status: 400 });
  try {
    await recoverStaleCommerceSyncJobs();
    let job;
    if (parsed.data.jobId) {
      job = await getCommerceSyncJob(parsed.data.jobId);
    } else if (parsed.data.botId && parsed.data.provider) {
      job = await getLatestCommerceSyncJob(parsed.data.botId, parsed.data.provider);
    } else {
      return NextResponse.json({ success: false, error: "Richiesta stato sync non valida" }, { status: 400 });
    }
    if (!job) return NextResponse.json({ success: true, data: null });
    schedule(job);
    return NextResponse.json({ success: true, data: serializeCommerceSyncJob(job) });
  } catch (error) {
    console.error("[Commerce sync status]", error);
    return NextResponse.json({ success: false, error: "Stato sincronizzazione temporaneamente non disponibile" }, { status: 500 });
  }
}
