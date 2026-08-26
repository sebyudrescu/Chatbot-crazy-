import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { DashboardAuthError, dashboardAuthErrorResponse, requireDashboardActor } from '@/lib/workspace-auth'

const CreateWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const actor = await requireDashboardActor(request)
    const workspaces = await prisma.workspace.findMany({
      where: actor.kind === 'legacy_owner' ? {} : { memberships: { some: { userId: actor.userId, status: 'active' } } },
      include: { _count: { select: { chatbots: true, memberships: true } } },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    })
    return NextResponse.json({ success: true, data: workspaces })
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error)
    if (authResponse) return authResponse
    return NextResponse.json({ success: false, error: 'Impossibile caricare i workspace' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireDashboardActor(request)
    if (actor.kind !== 'legacy_owner') throw new DashboardAuthError('Permessi insufficienti', 403)
    const input = CreateWorkspaceSchema.parse(await request.json())
    const baseSlug = input.slug || input.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const workspace = await prisma.workspace.create({ data: { name: input.name, slug: baseSlug, kind: 'client' } })
    return NextResponse.json({ success: true, data: workspace }, { status: 201 })
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error)
    if (authResponse) return authResponse
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Creazione non riuscita' }, { status: 400 })
  }
}
