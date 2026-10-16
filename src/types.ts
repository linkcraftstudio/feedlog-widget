export interface WidgetAuth {
  /**
   * Returns a JWT signed by the host's backend with the org's SSO secret, or
   * `null` when nobody is signed in. Throwing signals a temporary failure —
   * the SDK surfaces a retryable error instead of treating it as signed out.
   */
  getToken: () => Promise<string | null>
  /**
   * A Promise settles when the host UI exits, including cancellation.
   * Void callbacks keep the widget visible for compatibility.
   * Success is judged by the next getToken(), so cancellation also completes.
   */
  login?: () => void | Promise<void>
}

export type WidgetTheme = 'light' | 'dark' | 'auto'
export type LauncherState = 'button' | 'tab' | 'hidden'
export type LauncherCloseBehavior = 'none' | 'collapse' | 'hide'

export interface LauncherPlacement {
  alignment: 'left' | 'right'
  bottomOffset: number
  sideOffset: number
}

export interface LauncherOptions extends Partial<LauncherPlacement> {
  state?: LauncherState
}

export interface WidgetDisplayOptions {
  /** Explicit fields override dashboard defaults on desktop and mobile. */
  launcher?: LauncherOptions
  zIndex?: number
  theme?: WidgetTheme
  /** UI language tag, or auto (default). Currently resolves to English or Chinese. */
  locale?: string
}

export interface WidgetOptions extends WidgetDisplayOptions {
  /** FeedLog org address, e.g. `https://acme.feedlog.ai`. */
  baseUrl: string
  /**
   * How the host tells FeedLog who the visitor is. Optional: leave it out and
   * the widget runs without a host identity, which works when the org allows
   * guest posting — the embed page mints its own guest on the first message.
   * Products with no user system of their own can integrate with baseUrl alone.
   */
  auth?: WidgetAuth
  /**
   * Path of the hosted embed page the widget loads in its iframe. Defaults to
   * `/widget/embed`. Advanced/debug escape hatch — point it at a preview or
   * demo build without changing `baseUrl`. Must be a same-origin absolute path.
   */
  embedPath?: string
  /** Allows a custom host help entry to display unread messages. */
  onUnreadChange?: (count: number) => void
}

export interface WidgetConfig {
  enabled: boolean
  branding: {
    /** Final value computed server-side — the SDK never does color math. */
    primary: string
    primaryForeground: string
  }
  launcher: LauncherPlacement & { closeBehavior: LauncherCloseBehavior }
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

/** Requests and events from the trusted FeedLog frame. */
export type InboundMessage =
  | { v: 1, type: 'ready', payload?: { capabilities?: { resumeState?: boolean, theme?: boolean, locale?: boolean } } }
  | { v: 1, type: 'auth-requested', payload?: { reason?: AuthReason } }
  | { v: 1, type: 'unread', payload?: { count?: number } }
  | { v: 1, type: 'navigate', payload?: { to?: string, slug?: string } }
  | { v: 1, type: 'close-request' }
  | { v: 1, type: 'page-context-request', payload?: { requestId?: string } }
  | { v: 1, type: 'resume-state', payload?: { requestId?: string, state?: unknown } }
