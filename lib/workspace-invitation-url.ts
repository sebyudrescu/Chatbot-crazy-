export function buildWorkspaceInvitationUrl(baseUrl: string, token: string) {
  const base = new URL(baseUrl.trim())
  const url = new URL('/accept-invite', base.origin)
  url.searchParams.set('token', token)
  return url.toString()
}
