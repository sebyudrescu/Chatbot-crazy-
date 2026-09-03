import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dashboardAuthErrorResponse, DashboardAuthError, requireLegacyOwner } from '@/lib/workspace-auth'
import { writeWorkspaceAudit } from '@/lib/workspace-audit'

const TransferWorkspaceSchema = z.object({
  workspaceId: z.string().uuid(),
})

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireLegacyOwner(request)
    const { id } = await props.params
    const input = TransferWorkspaceSchema.parse(await request.json())
    const [chatbot, targetWorkspace] = await Promise.all([
      prisma.chatbot.findUnique({ where: { id }, select: { id: true, companyName: true, workspaceId: true } }),
      prisma.workspace.findUnique({ where: { id: input.workspaceId }, select: { id: true, name: true, kind: true } }),
    ])

    if (!chatbot || !targetWorkspace) throw new DashboardAuthError('Risorsa non trovata', 404)
    if (targetWorkspace.kind !== 'client') throw new DashboardAuthError('Seleziona un workspace cliente', 409)
    if (chatbot.workspaceId === targetWorkspace.id) {
      return NextResponse.json({ success: true, data: { ...chatbot, workspaceName: targetWorkspace.name } })
    }

    const updated = await prisma.$transaction(async tx => {
      const transferred = await tx.chatbot.update({
        where: { id: chatbot.id },
        data: { workspaceId: targetWorkspace.id },
        select: { id: true, companyName: true, workspaceId: true },
      })
      await writeWorkspaceAudit(tx, {
        workspaceId: chatbot.workspaceId,
        actor,
        action: 'chatbot.workspace_transferred_out',
        targetType: 'chatbot',
        targetId: chatbot.id,
        metadata: { destinationWorkspaceId: targetWorkspace.id },
      })
      await writeWorkspaceAudit(tx, {
        workspaceId: targetWorkspace.id,
        actor,
        action: 'chatbot.workspace_transferred_in',
        targetType: 'chatbot',
        targetId: chatbot.id,
        metadata: { sourceWorkspaceId: chatbot.workspaceId },
      })
      return transferred
    })

    return NextResponse.json({ success: true, data: { ...updated, workspaceName: targetWorkspace.name } })
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error)
    if (authResponse) return authResponse
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Assegnazione non riuscita' }, { status: 400 })
  }
}
