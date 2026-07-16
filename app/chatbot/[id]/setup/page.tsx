import { redirect } from 'next/navigation'

export default async function LegacySetupRedirect(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  redirect(`/chatbot/${params.id}/settings`)
}
