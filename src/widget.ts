import { fetchConfig } from './api'
import { AuthManager } from './auth'
import { consumeLoginPending } from './login-marker'
import { SessionCache } from './session-cache'
import type { AuthReason, InboundMessage, WidgetAuth, WidgetTheme } from './types'
import { WidgetUi } from './ui'
import { UnreadTracker } from './unread'

export interface BootOptions {
  baseUrl: string
  origin: string
  auth?: WidgetAuth
  theme: WidgetTheme
  /** Same-origin path of the hosted embed page; defaults resolved in index.ts. */
  embedPath: string
}

const LOAD_ERROR = 'Feedback could not be loaded.'
const PREWARM_TIMEOUT_MS = 3000
const PREWARM_DELAY_MS = 2500
const LOGIN_HIDE_MAX_MS = 60_000

interface NavigatorWithConnection extends Navigator {
  connection?: { saveData?: boolean }
}

export async function boot(options: BootOptions): Promise<Widget | null> {
  let config
  try {
    config = await fetchConfig(options.baseUrl)
  }
  catch {
    config = null
  }
  // No config means no verdict on `enabled`, and a launcher that cannot reach
  // its backend is worse than no launcher at all.
  if (!config) {
    console.warn('[feedlog/widget] could not load widget config; nothing was rendered')
    return null
  }
  if (!config.enabled) return null

  await domReady()
  const widget = new Widget(options, new WidgetUi(config.branding, options.theme, config.launcher))
  widget.start()
  return widget
}

export class Widget {
  private readonly auth: AuthManager
  private readonly unread: UnreadTracker
  /** The token the mounted iframe was built with — `null` means a signed-out frame. */
  private frameToken: string | null = null
  private hiddenForLogin = false

  constructor(private readonly options: BootOptions, private readonly ui: WidgetUi) {
    const cache = new SessionCache(options.origin)
    this.auth = new AuthManager(options.baseUrl, options.origin, this.yieldingAuth(options.auth), cache)
    this.unread = new UnreadTracker(
      options.baseUrl,
      options.origin,
      this.auth,
      count => this.ui.setBadge(count),
      !!options.auth,
    )
  }

  start(): void {
    this.ui.mount()
    this.ui.onLauncherClick(() => this.toggle())
    window.addEventListener('message', this.onMessage)
    this.unread.start()
    // A redirect-style `login()` navigated the page away mid-flow; the leftover
    // marker is the only trace that the user was on their way into the widget.
    if (consumeLoginPending(this.options.origin)) void this.open()
    this.prewarm()
  }

  /**
   * The frame mounts inside the closed panel, which hides it without stopping
   * it loading, so the first click becomes a display flip.
   */
  private prewarm(): void {
    if ((navigator as NavigatorWithConnection).connection?.saveData) return

    const run = (): void => {
      if (this.ui.hasIframe) return
      void this.sync({})
    }
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: PREWARM_TIMEOUT_MS })
    else setTimeout(run, PREWARM_DELAY_MS)
  }

  private toggle(): void {
    if (this.ui.isOpen) {
      this.ui.closePanel()
      return
    }
    void this.open()
  }

  close(): void {
    this.ui.closePanel()
  }

  async open(): Promise<void> {
    // An explicit host command outranks the yield: they asked for the panel
    // while their own sign-in is up, so give it to them.
    this.reveal()
    this.ui.openPanel()
    if (!this.ui.hasIframe) this.ui.showLoading()
    // Re-resolving on every open is what keeps the widget aligned with the host's
    // sign-in state; the session cache keeps it from costing a round trip.
    await this.sync({})
  }

  /**
   * Concurrency is handled one level down: AuthManager runs a single flow at a
   * time and hands joiners the same promise, so overlapping calls here cannot
   * produce two exchanges or two login popups.
   */
  private async sync(
    opts: { allowLogin?: boolean, ignoreCache?: boolean },
    staleToken?: string | null,
  ): Promise<void> {
    try {
      let session = await this.auth.resolve(opts)
      // The frame ran with this exact token and asked for auth anyway, so the
      // token is dead no matter what the cache's expiry claims.
      if (session && staleToken && session.token === staleToken) {
        session = await this.auth.resolve({ ...opts, ignoreCache: true })
      }
      const token = session?.token ?? null
      if (!this.ui.hasIframe || token !== this.frameToken) this.mountFrame(token)
    }
    catch {
      // getToken() or exchange threw: a temporary failure, not a sign-out. Keep a
      // working frame if there is one, otherwise offer a retry.
      if (!this.ui.hasIframe) this.ui.showError(LOAD_ERROR, () => this.retry())
    }
    finally {
      this.reveal()
    }
  }

  private yieldingAuth(auth: WidgetAuth | undefined): WidgetAuth | undefined {
    if (!auth?.login) return auth
    const login = auth.login
    return {
      getToken: () => auth.getToken(),
      login: async () => {
        this.hiddenForLogin = true
        this.ui.setHidden(true)
        const bail = setTimeout(() => this.reveal(), LOGIN_HIDE_MAX_MS)
        try {
          // .call keeps `this` on the host's auth object — a login() written as
          // an object method would otherwise lose it.
          await login.call(auth)
        }
        finally {
          clearTimeout(bail)
        }
      },
    }
  }

  private reveal(): void {
    if (!this.hiddenForLogin) return
    this.hiddenForLogin = false
    this.ui.setHidden(false)
  }

  private retry(): void {
    this.ui.showLoading()
    void this.sync({})
  }

  private mountFrame(token: string | null): void {
    this.frameToken = token
    this.ui.showLoading()
    // Ownership follows the mounted frame, not the opened panel. A frame built
    // without a host token is not necessarily a signed-out frame any more — it
    // may be running as a guest, in which case it has a real count to report and
    // this tracker, which knows nothing about guests, would only overwrite it
    // with zero on the next visibility change.
    this.unread.takeOver()
    if (!token) this.unread.push(0)

    const url = new URL(this.options.embedPath, this.options.baseUrl)
    url.searchParams.set('theme', this.options.theme)
    // The frame needs a concrete targetOrigin for its postMessage calls and
    // cannot derive one reliably: Firefox has no location.ancestorOrigins, and
    // the host's referrer-policy may strip the referrer.
    url.searchParams.set('origin', window.location.origin)
    // The session token rides in the fragment and nowhere else: fragments are not
    // sent to the server, so it stays out of access logs and Referer headers.
    const src = token ? `${url.toString()}#token=${encodeURIComponent(token)}` : url.toString()
    this.ui.setIframe(src)
  }

  private onMessage = (event: MessageEvent): void => {
    if (event.origin !== this.options.origin) return
    const frame = this.ui.frameWindow
    if (!frame || event.source !== frame) return

    const data: unknown = event.data
    if (!data || typeof data !== 'object') return
    const message = data as InboundMessage
    if (message.v !== 1 || typeof message.type !== 'string') return

    switch (message.type) {
      case 'ready':
        this.ui.showContent()
        return
      case 'auth-requested':
        void this.handleAuthRequest(message.payload?.reason)
        return
      case 'unread':
        this.unread.push(Number(message.payload?.count))
        return
      case 'navigate':
        void this.handleNavigate(message.payload)
        return
      case 'close-request':
        this.ui.closePanel()
        return
      default:
        // Unknown types are ignored so a newer iframe can ship messages an older
        // SDK has never heard of.
    }
  }

  private handleAuthRequest(reason: AuthReason | undefined): Promise<void> {
    // Both reasons start with a silent getToken — the user may have signed in on
    // another tab. Only an explicit click may escalate to the host's login UI;
    // an expired session must never make a popup appear unprompted.
    return this.sync(
      { allowLogin: reason === 'user', ignoreCache: reason === 'expired' },
      this.frameToken,
    )
  }

  private async handleNavigate(payload: { to?: string, slug?: string } | undefined): Promise<void> {
    const slug = payload?.slug
    if (payload?.to !== 'feedback' || typeof slug !== 'string' || !slug) return

    const path = `/p/${encodeURIComponent(slug)}`
    let target = new URL(path, this.options.baseUrl).toString()
    try {
      const jwt = await this.auth.getCustomerJwt()
      if (jwt) {
        const handoff = new URL('/api/sso/jwt', this.options.baseUrl)
        handoff.searchParams.set('jwt', jwt)
        handoff.searchParams.set('return_to', path)
        target = handoff.toString()
      }
    }
    catch {
      // Fall through to the public URL — the page is readable signed out.
    }
    // noopener is mandatory, and window.open returns null under it, so the URL
    // has to be final before opening: no pre-opened blank tab to fill in later.
    window.open(target, '_blank', 'noopener')
  }
}

function domReady(): Promise<void> {
  if (document.body) return Promise.resolve()
  return new Promise((resolve) => {
    document.addEventListener('DOMContentLoaded', () => resolve(), { once: true })
  })
}
