export async function accessToken(password: string, salt: string) {
  const data = new TextEncoder().encode(`${password}:${salt}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

const SESSION_VERSION = 'v1'
export const OWNER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14

async function sessionSignature(payload: string, password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`${salt}:${password}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function createOwnerSessionToken(
  password: string,
  salt: string,
  now = Date.now(),
) {
  const expiresAt = now + OWNER_SESSION_MAX_AGE_SECONDS * 1000
  const payload = `${SESSION_VERSION}.${expiresAt}`
  return `${payload}.${await sessionSignature(payload, password, salt)}`
}

export async function verifyOwnerSessionToken(
  token: string | undefined,
  password: string,
  salt: string,
  now = Date.now(),
) {
  if (!token) return false
  const [version, expiresAtText, receivedSignature, ...rest] = token.split('.')
  if (rest.length || version !== SESSION_VERSION || !/^\d{13}$/.test(expiresAtText) || !/^[a-f\d]{64}$/.test(receivedSignature)) {
    return false
  }
  const expiresAt = Number(expiresAtText)
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false
  const payload = `${version}.${expiresAtText}`
  const expectedSignature = await sessionSignature(payload, password, salt)
  return constantTimeEqual(receivedSignature, expectedSignature)
}

export function constantTimeEqual(received: string, expected: string) {
  if (received.length !== expected.length) return false
  let different = 0
  for (let index = 0; index < received.length; index += 1) {
    different |= received.charCodeAt(index) ^ expected.charCodeAt(index)
  }
  return different === 0
}
