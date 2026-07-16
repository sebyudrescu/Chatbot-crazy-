export async function accessToken(password: string, salt: string) {
  const data = new TextEncoder().encode(`${password}:${salt}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
