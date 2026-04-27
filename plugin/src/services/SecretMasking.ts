const SECRET_KEYS = new Set([
  'githubpat',
  'token',
  'pat',
  'authorization',
  'auth'
])

export function isSecretKey(key: string): boolean {
  return SECRET_KEYS.has(key.toLowerCase())
}

export function maskSecretValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  if (value.length === 0) return ''
  if (value.length <= 8) return '***'
  return `${value.slice(0, 4)}***${value.slice(-2)}`
}

export function redactSecrets(key: string, value: unknown): unknown {
  return isSecretKey(key) ? maskSecretValue(value) : value
}

export function redactRecordSecrets(
  record: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...record }
  for (const key of Object.keys(out)) {
    if (isSecretKey(key)) out[key] = maskSecretValue(out[key])
  }
  return out
}
