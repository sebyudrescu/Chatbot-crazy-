export interface IdempotentExecutionRecord {
  status: string;
  success: boolean;
  output: string | null;
  error: string | null;
}

export async function claimIdempotentExecution<RecordType extends IdempotentExecutionRecord>(
  create: () => Promise<RecordType>,
  findExisting: () => Promise<RecordType | null>,
): Promise<{ claimed: true; execution: RecordType } | { claimed: false; execution: RecordType }> {
  try {
    return { claimed: true, execution: await create() };
  } catch (claimError) {
    if (
      !claimError ||
      typeof claimError !== "object" ||
      !("code" in claimError) ||
      claimError.code !== "P2002"
    ) {
      throw claimError;
    }
    const existing = await findExisting();
    if (!existing) throw claimError;
    return { claimed: false, execution: existing };
  }
}
