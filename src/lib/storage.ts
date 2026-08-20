import type { Credentials } from './github'

const KEY = 'async-trivia:credentials'

export function loadCredentials(): Credentials | null {
  const raw = localStorage.getItem(KEY)
  if (!raw) return null

  try {
    const value = JSON.parse(raw) as Partial<Credentials>
    if (
      typeof value.token === 'string' &&
      typeof value.owner === 'string' &&
      typeof value.repo === 'string' &&
      typeof value.opponent === 'string'
    ) {
      return value as Credentials
    }
  } catch {
    // Corrupt entry: fall through and make the player set up again.
  }
  return null
}

export function saveCredentials(creds: Credentials): void {
  localStorage.setItem(KEY, JSON.stringify(creds))
}

export function clearCredentials(): void {
  localStorage.removeItem(KEY)
}
