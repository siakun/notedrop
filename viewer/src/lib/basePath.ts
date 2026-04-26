export const BASE_PATH: string = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export function withBase(path: string): string {
  if (!path.startsWith('/')) return path
  return `${BASE_PATH}${path}`
}
