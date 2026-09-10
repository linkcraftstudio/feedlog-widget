import type { LauncherPlacement, WidgetTheme } from './types'

const HOST_ID = 'feedlog-widget'
/** Must outlast the `.root[data-yield]` transitions below. */
const YIELD_MS = 340

const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; }

.root {
  position: fixed;
  right: 20px;
  bottom: var(--edge-bottom, 20px);
  z-index: 2147483000;
  font: 400 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color-scheme: light;
  --surface: #ffffff;
  --ink: #1f2937;
  --muted: #6b7280;
  --line: #e5e7eb;
}
.root[data-align="left"] { right: auto; left: 20px; }
.root[data-align="left"] .panel { right: auto; left: 0; }
.root[data-yield] .panel { transform: translateY(100%); }
.root[data-yield] .launcher { transform: translateY(96px); transition-delay: .1s; }
.root[data-theme="dark"] {
  color-scheme: dark;
  --surface: #16181d;
  --ink: #e5e7eb;
  --muted: #9ca3af;
  --line: #2b2f38;
}

.launcher {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--primary);
  color: var(--primary-foreground);
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(0, 0, 0, .22);
  transition: transform .15s ease, opacity .15s ease;
  -webkit-tap-highlight-color: transparent;
}
.launcher:hover { opacity: .9; }
.launcher:active { transform: scale(.95); }
.launcher:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
.launcher svg { width: 26px; height: 26px; display: block; }

.badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 10px;
  /* Notification red, never the brand color — an unread count reads as an alert. */
  background: #ef4444;
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  line-height: 20px;
  text-align: center;
  box-shadow: 0 0 0 2px var(--surface);
}
.badge[hidden] { display: none; }

.panel {
  position: absolute;
  right: 0;
  bottom: 72px;
  display: flex;
  width: 400px;
  height: min(680px, calc(100vh - 100px - var(--edge-bottom, 20px)));
  overflow: hidden;
  border-radius: 16px;
  background: var(--surface);
  box-shadow: 0 12px 48px rgba(0, 0, 0, .24);
  transition: transform .22s cubic-bezier(.4, 0, 1, 1);
  animation: feedlog-in .16s ease-out;
}
.panel[hidden] { display: none; }
@keyframes feedlog-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}

iframe {
  flex: 1;
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
  background: transparent;
}
iframe[hidden] { display: none; }

.state {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 24px;
  text-align: center;
  background: var(--surface);
  color: var(--ink);
}
.state[hidden] { display: none; }
.state p { margin: 0; color: var(--muted); font-size: 13px; }

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--line);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: feedlog-spin .8s linear infinite;
}
@keyframes feedlog-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .spinner { animation-duration: 2.4s; }
  .panel { animation: none; }
  .root .panel, .root .launcher { transition: none; }
}

.retry {
  padding: 7px 16px;
  border: 0;
  border-radius: 8px;
  background: var(--primary);
  color: var(--primary-foreground);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.retry:hover { opacity: .9; }

@media (max-width: 520px) {
  .root, .root[data-align="left"] { right: 12px; bottom: 12px; left: auto; }
  .root[data-open] .launcher { display: none; }
  .panel {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100dvh;
    border-radius: 0;
  }
}
`

const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9"/><path d="M12 15 12.4 12.05 17.35 4.5a1.25 1.25 0 0 1 2.1 1.36L14.5 13.4Z"/><path d="M7 13.5h3"/><path d="M7 17.5h4.5"/></svg>'

export interface Branding {
  primary: string
  primaryForeground: string
}

/**
 * All four pieces of DOM the SDK owns: launcher, badge, panel container and the
 * iframe. Everything lives in a shadow root so the host page's CSS reset — or
 * its `* { }` rules — cannot reach in and break the widget.
 */
export class WidgetUi {
  private readonly host: HTMLDivElement
  private readonly root: HTMLDivElement
  private readonly launcher: HTMLButtonElement
  private readonly badge: HTMLSpanElement
  private readonly panel: HTMLDivElement
  private readonly state: HTMLDivElement
  private readonly stateText: HTMLParagraphElement
  private readonly spinner: HTMLDivElement
  private readonly retryButton: HTMLButtonElement
  private iframe: HTMLIFrameElement | null = null
  private retryHandler: (() => void) | null = null
  private yieldTimer: ReturnType<typeof setTimeout> | undefined

  constructor(branding: Branding, theme: WidgetTheme, launcher: LauncherPlacement) {
    this.host = document.createElement('div')
    this.host.id = HOST_ID
    const shadow = this.host.attachShadow({ mode: 'open' })

    const style = document.createElement('style')
    style.textContent = STYLES
    shadow.appendChild(style)

    this.root = el('div', 'root')
    this.root.style.setProperty('--primary', branding.primary)
    this.root.style.setProperty('--primary-foreground', branding.primaryForeground)
    this.root.style.setProperty('--edge-bottom', `${launcher.bottomOffset}px`)
    this.root.dataset.align = launcher.alignment
    applyTheme(this.root, theme)

    this.panel = el('div', 'panel')
    this.panel.hidden = true
    this.panel.setAttribute('role', 'dialog')
    this.panel.setAttribute('aria-label', 'Feedback')

    this.state = el('div', 'state')
    this.spinner = el('div', 'spinner')
    this.stateText = document.createElement('p')
    this.retryButton = el('button', 'retry')
    this.retryButton.type = 'button'
    this.retryButton.textContent = 'Try again'
    this.retryButton.hidden = true
    this.retryButton.addEventListener('click', () => this.retryHandler?.())
    this.state.append(this.spinner, this.stateText, this.retryButton)
    this.panel.appendChild(this.state)

    this.launcher = el('button', 'launcher')
    this.launcher.type = 'button'
    this.launcher.setAttribute('aria-label', 'Feedback')
    this.launcher.setAttribute('aria-expanded', 'false')
    this.launcher.innerHTML = ICON
    this.badge = el('span', 'badge')
    this.badge.hidden = true
    this.badge.setAttribute('aria-live', 'polite')
    this.launcher.appendChild(this.badge)

    this.root.append(this.panel, this.launcher)
    shadow.appendChild(this.root)
  }

  mount(): void {
    document.body.appendChild(this.host)
  }

  setHidden(hidden: boolean): void {
    clearTimeout(this.yieldTimer)
    if (!hidden) {
      this.host.style.display = ''
      // Without this read both writes land in the same frame and it jumps.
      void this.root.offsetWidth
      delete this.root.dataset.yield
      return
    }
    this.root.dataset.yield = ''
    this.yieldTimer = setTimeout(() => { this.host.style.display = 'none' }, YIELD_MS)
  }

  onLauncherClick(handler: () => void): void {
    this.launcher.addEventListener('click', handler)
  }

  get isOpen(): boolean {
    return !this.panel.hidden
  }

  openPanel(): void {
    this.panel.hidden = false
    this.root.dataset.open = ''
    this.launcher.setAttribute('aria-expanded', 'true')
  }

  closePanel(): void {
    this.panel.hidden = true
    delete this.root.dataset.open
    this.launcher.setAttribute('aria-expanded', 'false')
  }

  setBadge(count: number): void {
    if (count <= 0) {
      this.badge.hidden = true
      return
    }
    this.badge.textContent = count > 9 ? '9+' : String(count)
    this.badge.hidden = false
  }

  showLoading(): void {
    this.retryHandler = null
    this.spinner.hidden = false
    this.stateText.textContent = ''
    this.retryButton.hidden = true
    this.state.hidden = false
    if (this.iframe) this.iframe.hidden = true
  }

  showError(message: string, onRetry: () => void): void {
    this.retryHandler = onRetry
    this.spinner.hidden = true
    this.stateText.textContent = message
    this.retryButton.hidden = false
    this.state.hidden = false
    if (this.iframe) this.iframe.hidden = true
  }

  showContent(): void {
    this.retryHandler = null
    this.state.hidden = true
    if (this.iframe) this.iframe.hidden = false
  }

  /** Replaces any existing frame — a new session is delivered by rebuilding, never by messaging. */
  setIframe(src: string): void {
    this.removeIframe()
    const frame = document.createElement('iframe')
    frame.title = 'Feedback'
    frame.hidden = true
    frame.setAttribute('allow', 'clipboard-write')
    frame.src = src
    this.panel.appendChild(frame)
    this.iframe = frame
  }

  removeIframe(): void {
    this.iframe?.remove()
    this.iframe = null
  }

  get frameWindow(): Window | null {
    return this.iframe?.contentWindow ?? null
  }

  get hasIframe(): boolean {
    return this.iframe !== null
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  return node
}

function applyTheme(root: HTMLElement, theme: WidgetTheme): void {
  if (theme !== 'auto') {
    root.dataset.theme = theme
    return
  }
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const sync = (): void => {
    root.dataset.theme = media.matches ? 'dark' : 'light'
  }
  sync()
  media.addEventListener('change', sync)
}
