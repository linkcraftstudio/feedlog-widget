export interface WidgetAuth {
  /**
   * Returns a JWT signed by the host's backend with the org's SSO secret, or
   * `null` when nobody is signed in. Throwing signals a temporary failure —
   * the SDK surfaces a retryable error instead of treating it as signed out.
   */
  getToken: () => Promise<string | null>
  /**
   * Opens the host's own sign-in UI (popup or full-page redirect). Settling
   * only means the interaction ended; success is judged by the next
   * `getToken()`.
   */
  login?: () => void | Promise<void>
}

export type WidgetTheme = 'light' | 'dark' | 'auto'

export interface WidgetOptions {
  /** FeedLog org address, e.g. `https://acme.feedlog.ai`. */
  baseUrl: string
  /**
   * How the host tells FeedLog who the visitor is. Optional: leave it out and
   * the widget runs without a host identity, which works when the org allows
   * guest posting — the embed page mints its own guest on the first message.
   * Products with no user system of their own can integrate with baseUrl alone.
   */
  auth?: WidgetAuth
  /** Passed to the embed page as a query param so the first paint is not mis-themed. */
  theme?: WidgetTheme
  /**
   * Path of the hosted embed page the widget loads in its iframe. Defaults to
   * `/widget/embed`. Advanced/debug escape hatch — point it at a preview or
   * demo build without changing `baseUrl`. Must be a same-origin absolute path.
   */
  embedPath?: string
}

export interface WidgetConfig {
  enabled: boolean
  branding: {
    /** Final value computed server-side — the SDK never does color math. */
    primary: string
    primaryForeground: string
  }
  launcher: LauncherPlacement
}

/** Set by the customer in their FeedLog dashboard. Desktop only. */
export interface LauncherPlacement {
  alignment: 'left' | 'right'
  bottomOffset: number
}

export interface ExchangeResponse {
  token: string
  expiresAt: string
  user: {
    id: string
    email: string
    name: string
    image: string | null
  }
}

/** A better-auth session token plus the identity it belongs to. */
export interface Session {
  email: string
  token: string
  expiresAt: string
}

export type AuthReason = 'user' | 'expired'

/**
 * Inbound protocol. The channel is one-way: the iframe talks to the SDK and
 * never the other way around, so there is no outbound counterpart to this.
 */
export type InboundMessage =
  | { v: 1, type: 'ready' }
  | { v: 1, type: 'auth-requested', payload?: { reason?: AuthReason } }
  | { v: 1, type: 'unread', payload?: { count?: number } }
  | { v: 1, type: 'navigate', payload?: { to?: string, slug?: string } }
  | { v: 1, type: 'close-request' }
