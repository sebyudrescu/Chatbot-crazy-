import type { Metadata } from 'next'
import { PublicAgentExperience } from '@/components/PublicAgentExperience'

export const metadata: Metadata = {
  title: 'Assistente LitX AI',
  description: 'Chatta con un assistente AI verificato.',
  robots: { index: false, follow: false },
}

export default async function PublicAgentPage(
  props: { params: Promise<{ botId: string }> },
) {
  const { botId } = await props.params
  return <PublicAgentExperience botId={botId} />
}
