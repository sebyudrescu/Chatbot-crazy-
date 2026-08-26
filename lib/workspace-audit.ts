import { Prisma } from '@prisma/client'
import type { DashboardActor } from '@/lib/workspace-permissions'

type WorkspaceAuditClient = Prisma.TransactionClient

interface WorkspaceAuditInput {
  workspaceId: string
  actor: DashboardActor
  action: string
  targetType: string
  targetId?: string | null
  metadata?: Record<string, string | number | boolean | null>
}

export async function writeWorkspaceAudit(client: WorkspaceAuditClient, input: WorkspaceAuditInput) {
  await client.workspaceAuditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorUserId: input.actor.kind === 'user' ? input.actor.userId : null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId || null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  })
}
