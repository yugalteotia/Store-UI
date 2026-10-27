/** Safe localStorage helpers: malformed data never crashes the app. */
export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as unknown
    return parsed === null || parsed === undefined ? fallback : (parsed as T)
  } catch {
    return fallback
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full / unavailable: prototype keeps working in memory.
  }
}

export function isValidTheme(value: unknown): value is 'light' | 'dark' | 'system' {
  return value === 'light' || value === 'dark' || value === 'system'
}
