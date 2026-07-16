import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const parse = (value: string) => { try { return JSON.parse(value) } catch { return {} } }
export async function GET(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const versions = await prisma.promptVersion.findMany({ where: { botId: params.id }, orderBy: { version: 'desc' }, take: 100 })
  return NextResponse.json({ success: true, data: versions.map(item => ({ ...item, settings: parse(item.settings) })) })
}
