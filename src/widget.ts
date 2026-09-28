import { fetchConfig } from './api'
import { AuthManager } from './auth'
import { consumeLoginPending } from './login-marker'
import { SessionCache } from './session-cache'
import { sessionStore } from './storage'
import { closeBehavior, DEFAULT_WIDGET_Z_INDEX, launcherState, mergeDisplay, placement, restoredLauncherState } from './display'
import { readPosition, type DockedPosition } from './position'
import type { AuthReason, InboundMessage, LauncherCloseBehavior, LauncherPlacement, LauncherState, WidgetDisplayOptions, WidgetOptions, WidgetTheme } from './types'
import { WidgetUi } from './ui'
import { UnreadTracker } from './unread'

export interface BootOptions extends WidgetOptions {
  origin: string
  theme: NonNullable<WidgetOptions['theme']>
  /** Same-origin path of the hosted embed page; defaults resolved in index.ts. */
  embedPath: string
}

const LOAD_ERROR = 'Feedback could not be loaded.'
const PREWARM_TIMEOUT_MS = 3000
const PREWARM_DELAY_MS = 2500

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
  return new Widget(options, new WidgetUi(config.branding, options.theme), config.launcher, config.launcher.closeBehavior)
}

export class Widget {
  private readonly auth: AuthManager
  private readonly unread: UnreadTracker
  /** The token the mounted iframe was built with — `null` means a signed-out frame. */
  private frameToken: string | null = null
  private display: WidgetDisplayOptions
  private readonly preferenceKey: string
  private readonly positionKey: string
  private position: DockedPosition | null
  private readonly loginResumeKey: string
  private preference: LauncherState
  private readonly closeBehavior: LauncherCloseBehavior
  private loginBlocking = false
  private loginCompleted = false
  private frameUpdate: Promise<void> = Promise.resolve()
  private canResume = false
  private frameReady = false
  private canUpdateTheme = false
  private frameTheme: WidgetTheme = 'auto'
  private warnedTheme: WidgetTheme | undefined
  private resumeState: unknown
  private stateSequence = 0
  private stateRequest: { id: string, resolve: (state: unknown) => void } | null = null

  constructor(private readonly options: BootOptions, private readonly ui: WidgetUi, private readonly defaults: LauncherPlacement, behavior: LauncherCloseBehavior = 'collapse') {
    this.display = mergeDisplay({}, options)
    this.preferenceKey = `feedlog:widget:launcher:${options.baseUrl}`
    this.positionKey = `feedlog:widget:position:${options.baseUrl}`
    this.position = readPosition(sessionStore().get(this.positionKey))
    this.loginResumeKey = `feedlog:widget:login-resume:${options.baseUrl}`
    this.closeBehavior = closeBehavior(behavior)
    this.preference = options.launcher?.state ?? restoredLauncherState(sessionStore().get(this.preferenceKey), this.closeBehavior)
    this.persistPreference()
    const cache = new SessionCache(options.origin)
    const hostAuth = options.auth
    this.auth = new AuthManager(options.baseUrl, options.origin, hostAuth ? {
      getToken: () => hostAuth.getToken(),
      login: hostAuth.login ? () => this.runLogin() : undefined,
    } : undefined, cache)
    this.unread = new UnreadTracker(
      options.baseUrl,
      options.origin,
      this.auth,
      (count) => {
        this.ui.setBadge(count)
        try { this.options.onUnreadChange?.(count) }
        catch { console.warn('[feedlog/widget] onUnreadChange callback failed') }
      },
      !!options.auth,
    )
  }

  start(initialOpen?: boolean): void {
    this.applyDisplay()
    this.ui.mount()
    this.ui.onLauncherClick(() => {
      if (this.preference === 'tab') this.changeLauncher('button')
      this.toggle()
    })
    this.ui.onLauncherStateChange(state => this.changeLauncher(state))
    this.ui.onPositionChange(position => {
      this.position = position
      sessionStore().set(this.positionKey, JSON.stringify(position))
      this.applyDisplay()
    })
    window.addEventListener('message', this.onMessage)
    this.unread.start()
    // A redirect-style `login()` navigated the page away mid-flow; the leftover
    // marker is the only trace that the user was on their way into the widget.
    const returningFromLogin = consumeLoginPending(this.options.origin)
    if (returningFromLogin) {
      try { this.resumeState = JSON.parse(sessionStore().get(this.loginResumeKey) ?? 'null') ?? undefined }
      catch { this.resumeState = undefined }
    }
    sessionStore().remove(this.loginResumeKey)
    if (initialOpen ?? returningFromLogin) void this.open()
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

  async open(): Promise<void> {
    this.ui.openPanel()
    if (!this.ui.hasIframe) this.ui.showLoading()
    // Re-resolving on every open is what keeps the widget aligned with the host's
    // sign-in state; the session cache keeps it from costing a round trip.
    await this.sync({})
  }

  close(): void {
    // Host code may already have focused its own dialog.
    this.ui.closePanel(false)
  }

  update(options: WidgetDisplayOptions): void {
    const movesLauncher = options.launcher?.alignment !== undefined || options.launcher?.bottomOffset !== undefined || options.launcher?.sideOffset !== undefined
    if (movesLauncher && this.position) {
      this.display = mergeDisplay(this.display, { launcher: this.ui.currentPlacement() })
      this.position = null
      sessionStore().remove(this.positionKey)
    }
    this.display = mergeDisplay(this.display, options)
    if (options.launcher?.state !== undefined) {
      this.preference = options.launcher.state
      this.persistPreference()
    }
    this.applyDisplay()
  }

  private applyVisibility(): void {
    this.ui.setHidden(this.loginBlocking)
  }

  private applyDisplay(): void {
    this.ui.setPlacement(placement({ ...this.defaults, ...this.display.launcher }), this.display.zIndex ?? DEFAULT_WIDGET_Z_INDEX, this.position)
    this.ui.setLauncher(this.preference, this.closeBehavior)
    this.applyTheme()
    this.applyVisibility()
  }

  private applyTheme(): void {
    const theme = this.display.theme ?? 'auto'
    if (!this.ui.hasIframe) {
      this.ui.setTheme(theme)
      return
    }
    if (this.frameReady && this.canUpdateTheme && theme !== this.frameTheme) {
      this.ui.frameWindow!.postMessage({ v: 1, type: 'set-theme', payload: { theme } }, this.options.origin)
      this.frameTheme = theme
    }
    else if (this.frameReady && !this.canUpdateTheme && theme !== this.frameTheme && theme !== this.warnedTheme) {
      console.warn('[feedlog/widget] this embed page does not support live theme updates; keeping its current theme')
      this.warnedTheme = theme
    }
    // An older frame cannot change without reloading and losing its draft.
    this.ui.setTheme(this.frameTheme)
  }

  private changeLauncher(state: LauncherState): void {
    if (launcherState(state, this.closeBehavior) !== state) return
    this.preference = state
    this.persistPreference()
    this.applyDisplay()
  }

  private persistPreference(): void {
    // Hiding lasts for this page only; clear any previously collapsed preference.
    if (this.preference === 'hidden') sessionStore().remove(this.preferenceKey)
    else sessionStore().set(this.preferenceKey, this.preference)
  }

  private async runLogin(): Promise<void> {
    const auth = this.options.auth!
    try {
      const state = await this.captureState()
      if (state !== undefined) {
        this.resumeState = state
        sessionStore().set(this.loginResumeKey, JSON.stringify(state))
      }
      const returned = auth.login!()
      // Legacy void callbacks provide no exit signal, so they must not hide UI.
      if (!returned || typeof returned.then !== 'function') return
      this.loginBlocking = true
      this.applyVisibility()
      try { await returned }
      finally { this.loginCompleted = true }
    }
    finally {
      sessionStore().remove(this.loginResumeKey)
    }
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
      this.frameUpdate = this.frameUpdate.then(async () => {
        if (!this.ui.hasIframe || token !== this.frameToken) await this.mountFrame(token)
      })
      await this.frameUpdate
    }
    catch {
      // getToken() or exchange threw: a temporary failure, not a sign-out. Keep a
      // working frame if there is one, otherwise offer a retry.
      if (!this.ui.hasIframe) this.ui.showError(LOAD_ERROR, () => this.retry())
    }
    finally {
      if (this.loginCompleted) {
        this.loginCompleted = false
        this.loginBlocking = false
        this.applyVisibility()
        this.ui.focusPanel()
      }
    }
  }

  private retry(): void {
    this.ui.showLoading()
    void this.sync({})
  }

  private async mountFrame(token: string | null): Promise<void> {
    this.resumeState = (await this.captureState()) ?? this.resumeState
    this.frameToken = token
    this.canResume = false
    this.frameReady = false
    this.canUpdateTheme = false
    this.warnedTheme = undefined
    this.frameTheme = this.display.theme ?? 'auto'
    this.ui.setTheme(this.frameTheme)
    this.ui.showLoading()
    // Ownership follows the mounted frame, not the opened panel. A frame built
    // without a host token is not necessarily a signed-out frame any more — it
    // may be running as a guest, in which case it has a real count to report and
    // this tracker, which knows nothing about guests, would only overwrite it
    // with zero on the next visibility change.
    this.unread.takeOver()
    if (!token) this.unread.push(0)

    const url = new URL(this.options.embedPath, this.options.baseUrl)
    url.searchParams.set('theme', this.frameTheme)
    // The frame needs a concrete targetOrigin for its postMessage calls and
    // cannot derive one reliably: Firefox has no location.ancestorOrigins, and
    // the host's referrer-policy may strip the referrer.
    url.searchParams.set('origin', window.location.origin)
    // The session token rides in the fragment and nowhere else: fragments are not
    // sent to the server, so it stays out of access logs and Referer headers.
    const src = token ? `${url.toString()}#token=${encodeURIComponent(token)}` : url.toString()
    this.ui.setIframe(src)
  }

  private captureState(): Promise<unknown> {
    if (!this.canResume || !this.ui.frameWindow) return Promise.resolve(undefined)
    return new Promise((resolve) => {
      const id = String(++this.stateSequence)
      const timer = setTimeout(() => {
        if (this.stateRequest?.id === id) this.stateRequest = null
        resolve(undefined)
      }, 750)
      this.stateRequest = { id, resolve: (state) => { clearTimeout(timer); this.stateRequest = null; resolve(state) } }
      this.ui.frameWindow!.postMessage({ v: 1, type: 'resume-state-request', payload: { requestId: id } }, this.options.origin)
    })
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
        this.canResume = message.payload?.capabilities?.resumeState === true
        this.frameReady = true
        this.canUpdateTheme = message.payload?.capabilities?.theme === true
        frame.postMessage({ v: 1, type: 'init', payload: {
          capabilities: { pageContext: true },
          ...(this.canResume && this.resumeState !== undefined ? { resumeState: this.resumeState } : {}),
        } }, this.options.origin)
        this.resumeState = undefined
        this.applyTheme()
        this.ui.showContent()
        return
      case 'resume-state':
        if (message.payload?.requestId === this.stateRequest?.id) this.stateRequest?.resolve(message.payload?.state)
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
      case 'page-context-request': {
        const requestId = message.payload?.requestId
        if (typeof requestId !== 'string' || requestId.length > 100) return
        const description = document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content
        frame.postMessage({ v: 1, type: 'page-context', payload: {
          requestId,
          context: {
            pathname: window.location.pathname.slice(0, 2000),
            ...(document.title ? { title: document.title.slice(0, 500) } : {}),
            ...(description ? { description: description.slice(0, 2000) } : {}),
          },
        } }, this.options.origin)
        return
      }
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
