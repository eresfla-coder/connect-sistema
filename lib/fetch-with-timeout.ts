export const DEFAULT_FETCH_TIMEOUT_MS = 1500

export class FetchTimeoutError extends Error {
  constructor(ms: number) {
    super(`Requisição excedeu ${ms}ms`)
    this.name = 'FetchTimeoutError'
  }
}

/** fetch com AbortController — evita pendurar a UI ou o middleware. */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(input, {
      ...init,
      signal: init?.signal ?? controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new FetchTimeoutError(timeoutMs)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/** Promise.race com timeout — útil para getSession/getUser no edge. */
export async function withTimeout<T, F = T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => F,
): Promise<T | F> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<F>((resolve) => {
        timer = setTimeout(() => resolve(onTimeout()), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
