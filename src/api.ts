import type { ExchangeResponse, WidgetConfig } from './types'

const OFFSET_DEFAULT = 20
const OFFSET_MAX = 200

/** Thrown by `unread` so the caller can tell "session is dead" from "network hiccup". */
export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized')
    this.name = 'UnauthorizedError'
  }
}

export async function fetchConfig(baseUrl: string): Promise<WidgetConfig | null> {
  const res = await fetch(`${baseUrl}/api/widget/config`, {
    method: 'GET',
    credentials: 'omit',
  })
  if (!res.ok) return null
  const body = await res.json() as Partial<WidgetConfig>
  if (!body || typeof body !== 'object') return null
  return {
    enabled: body.enabled === true,
    branding: {
      primary: body.branding?.primary || '#111827',
      primaryForeground: body.branding?.primaryForeground || '#FFFFFF',
    },
    launcher: {
      alignment: body.launcher?.alignment === 'left' ? 'left' : 'right',
      bottomOffset: clampOffset(body.launcher?.bottomOffset),
    },
  }
}

function clampOffset(value: unknown): number {
  const n = Math.trunc(Number(value))
  if (!Number.isFinite(n) || n < 0) return OFFSET_DEFAULT
  return Math.min(n, OFFSET_MAX)
}

export async function exchange(baseUrl: string, jwt: string): Promise<ExchangeResponse> {
  const res = await fetch(`${baseUrl}/api/widget/auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // The endpoint sets no cookie and reads none; sending them would only make
    // the CORS preflight stricter for no gain.
    credentials: 'omit',
    body: JSON.stringify({ jwt }),
  })
  if (!res.ok) {
    throw new Error(`Widget token exchange failed with status ${res.status}`)
  }
  const body = await res.json() as ExchangeResponse
  if (!body?.token) {
    throw new Error('Widget token exchange returned no token')
  }
  return body
}

export async function fetchUnread(baseUrl: string, token: string): Promise<number> {
  const res = await fetch(`${baseUrl}/api/widget/unread`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'omit',
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error(`Widget unread request failed with status ${res.status}`)
  const body = await res.json() as { count?: unknown }
  return typeof body?.count === 'number' && body.count > 0 ? Math.floor(body.count) : 0
}
