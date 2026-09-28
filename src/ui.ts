import type { LauncherCloseBehavior, LauncherPlacement, LauncherState, WidgetTheme } from './types'
import { clamp, panelPlacement, type DockedPosition } from './position'
import { DEFAULT_WIDGET_Z_INDEX } from './display'

const HOST_ID = 'feedlog-widget'

const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; }

.root {
  position: fixed;
  --side-offset: 20px;
  --bottom-offset: 20px;
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
  --launcher-duration: 220ms;
  --launcher-ease: cubic-bezier(.22, 1, .36, 1);
  --tab-safe-inset: var(--safe-right);
  --tab-content-start: 0px;
  right: min(calc(var(--side-offset) + var(--safe-right)), calc(100% - 112px - var(--safe-left)));
  bottom: min(calc(var(--bottom-offset) + var(--safe-bottom)), calc(100dvh - 76px - var(--safe-top)));
  width: 56px;
  height: 56px;
  pointer-events: none;
  z-index: var(--z-index, ${DEFAULT_WIDGET_Z_INDEX});
  font: 400 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color-scheme: light;
  --surface: #ffffff;
  --ink: #1f2937;
  --muted: #6b7280;
  --line: #e5e7eb;
}
.root[hidden] { display: block; visibility: hidden; pointer-events: none; }
.launcher, .panel { pointer-events: auto; }
.root[data-alignment="left"] {
  right: auto;
  left: min(calc(var(--side-offset) + var(--safe-left)), calc(100% - 112px - var(--safe-right)));
  --tab-safe-inset: var(--safe-left);
  --tab-content-start: var(--safe-left);
}
.root[data-theme="dark"] {
  color-scheme: dark;
  --surface: #16181d;
  --ink: #e5e7eb;
  --muted: #9ca3af;
  --line: #2b2f38;
}

.launcher {
  position: absolute;
  bottom: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  padding: 0;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  border: 1px solid transparent;
  border-radius: 28px;
  background: var(--primary);
  color: var(--primary-foreground);
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(0, 0, 0, .22);
  transition: width var(--launcher-duration) var(--launcher-ease),
    padding var(--launcher-duration) var(--launcher-ease),
    border-radius var(--launcher-duration) var(--launcher-ease),
    background-color var(--launcher-duration) ease,
    border-color var(--launcher-duration) ease,
    color var(--launcher-duration) ease,
    box-shadow var(--launcher-duration) ease, opacity .15s ease;
  -webkit-tap-highlight-color: transparent;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.launcher[hidden] { display: none; }
.root[data-alignment="left"] .launcher { left: 0; right: auto; }
.launcher[data-state="tab"] {
  width: calc(22px + var(--tab-safe-inset));
  padding-right: var(--tab-safe-inset);
  border-radius: 8px 0 0 8px;
  background: var(--surface);
  color: var(--primary);
  border-color: var(--line);
  border-right-color: transparent;
  box-shadow: -2px 1px 6px rgba(0, 0, 0, .06);
}
.root[data-alignment="left"] .launcher[data-state="tab"] {
  padding-right: 0;
  padding-left: var(--tab-safe-inset);
  border-radius: 0 8px 8px 0;
  border-right-color: var(--line);
  border-left-color: transparent;
  box-shadow: 2px 1px 6px rgba(0, 0, 0, .06);
}
/* A narrow visible tab keeps a reachable touch target on the inward side. */
.launcher[data-state="tab"]::after {
  content: '';
  position: absolute;
  right: 0;
  top: 50%;
  width: max(100%, calc(44px + var(--tab-safe-inset)));
  height: max(100%, 44px);
  transform: translateY(-50%);
}
.root[data-alignment="left"] .launcher[data-state="tab"]::after { left: 0; right: auto; }
.launcher > svg, .tab-label {
  position: absolute;
  pointer-events: none;
  transition: opacity .16s ease, transform var(--launcher-duration) var(--launcher-ease);
}
.launcher > svg { width: 26px; height: 26px; opacity: 1; transform: scale(1); }
.launcher[data-state="tab"] > svg { opacity: 0; transform: scale(.65); }
.tab-label { writing-mode: vertical-rl; opacity: 0; transform: scale(.85); }
.launcher[data-state="tab"] .tab-label { opacity: 1; transform: scale(1); }
.launcher:hover { opacity: .9; }
.root[data-dragging="true"] .launcher { cursor: grabbing; }
.root[data-dragging="true"] .launcher:focus-visible { outline: none; }
.root[data-dragging="true"] .launcher[data-state="tab"] {
  border-radius: 8px;
  border-color: var(--line);
  box-shadow: 0 4px 12px rgba(0, 0, 0, .12);
}
.root[data-dragging="true"] .launcher-close, .root[data-snapping="true"] .launcher-close { display: none; }
.launcher:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }

.launcher-close {
  position: absolute;
  left: -20px;
  top: var(--launcher-close-top, -20px);
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  touch-action: manipulation;
}
.launcher-close span {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
}
.launcher-close svg { width: 18px; height: 18px; stroke-width: 1.8; }
.root[data-theme="dark"] .launcher-close { color: #94a3b8; }
.launcher-close:hover { color: var(--ink); }
.launcher-close:active span { transform: scale(.9); }
.root[data-alignment="left"] .launcher-close { left: auto; right: -20px; }
.root:hover .launcher-close, .root:focus-within .launcher-close { opacity: 1; pointer-events: auto; }
.launcher-close[hidden], .root[data-panel-open="true"] .launcher-close { display: none; }
.launcher-close:focus-visible span { outline: 2px solid var(--primary); outline-offset: 2px; }

@media (hover: none), (pointer: coarse) {
  .launcher-close { opacity: 1; pointer-events: auto; }
}

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
.root[data-alignment="left"] .badge { left: -2px; right: auto; }
.root .launcher[data-state="tab"] .badge {
  left: calc(var(--tab-content-start) + (100% - var(--tab-safe-inset)) / 2);
  right: auto;
  top: 4px;
  transform: translateX(-50%);
  min-width: 5px;
  width: 5px;
  height: 5px;
  font-size: 0;
  line-height: 0;
  padding: 0;
  box-shadow: none;
}

.panel {
  position: fixed;
  left: var(--panel-left);
  top: var(--panel-top);
  display: flex;
  width: var(--panel-width);
  height: var(--panel-height);
  overflow: hidden;
  border-radius: 16px;
  background: var(--surface);
  box-shadow: 0 12px 48px rgba(0, 0, 0, .24);
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
  .launcher, .launcher > svg, .tab-label { transition: none; }
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

.state-close {
  position: absolute;
  top: max(12px, env(safe-area-inset-top));
  right: max(12px, env(safe-area-inset-right));
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 50%;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 26px;
  cursor: pointer;
}
.state-close:focus-visible { outline: 2px solid var(--primary); }

@media (max-width: 520px) {
  .launcher[aria-expanded="true"] { display: none; }
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
 * A shadow root isolates the host's CSS resets from the launcher and panel
 * without introducing a framework into the host page.
 */
export class WidgetUi {
  private readonly host: HTMLDivElement
  private readonly root: HTMLDivElement
  private readonly launcher: HTMLButtonElement
  private readonly launcherClose: HTMLButtonElement
  private readonly badge: HTMLSpanElement
  private readonly panel: HTMLDivElement
  private readonly state: HTMLDivElement
  private readonly stateClose: HTMLButtonElement
  private readonly stateText: HTMLParagraphElement
  private readonly spinner: HTMLDivElement
  private readonly retryButton: HTMLButtonElement
  private readonly systemTheme: MediaQueryList
  private theme: WidgetTheme = 'auto'
  private launcherStateHandler: ((state: LauncherState) => void) | null = null
  private positionHandler: ((position: DockedPosition) => void) | null = null
  private placement: LauncherPlacement = { alignment: 'right', sideOffset: 20, bottomOffset: 20 }
  private docked: DockedPosition | null = null
  private drag: { pointerId: number, x: number, y: number, left: number, top: number, moved: boolean } | null = null
  private suppressClick = false
  private snapAnimation: Animation | null = null
  private returnFocus: HTMLElement | null = null
  private iframe: HTMLIFrameElement | null = null
  private retryHandler: (() => void) | null = null

  constructor(branding: Branding, theme: WidgetTheme) {
    this.host = document.createElement('div')
    this.host.id = HOST_ID
    const shadow = this.host.attachShadow({ mode: 'open' })

    const style = document.createElement('style')
    style.textContent = STYLES
    shadow.appendChild(style)

    this.root = el('div', 'root')
    this.root.style.setProperty('--primary', branding.primary)
    this.root.style.setProperty('--primary-foreground', branding.primaryForeground)
    this.systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
    this.systemTheme.addEventListener('change', () => this.setTheme(this.theme))
    this.setTheme(theme)

    this.panel = el('div', 'panel')
    this.panel.hidden = true
    this.panel.setAttribute('role', 'dialog')
    this.panel.setAttribute('aria-label', 'Feedback')

    this.state = el('div', 'state')
    this.stateClose = el('button', 'state-close')
    this.stateClose.type = 'button'
    this.stateClose.setAttribute('aria-label', 'Close feedback')
    this.stateClose.textContent = '×'
    this.stateClose.addEventListener('click', () => this.closePanel())
    this.spinner = el('div', 'spinner')
    this.stateText = document.createElement('p')
    this.retryButton = el('button', 'retry')
    this.retryButton.type = 'button'
    this.retryButton.textContent = 'Try again'
    this.retryButton.hidden = true
    this.retryButton.addEventListener('click', () => this.retryHandler?.())
    this.state.append(this.stateClose, this.spinner, this.stateText, this.retryButton)
    this.panel.appendChild(this.state)

    this.launcher = el('button', 'launcher')
    this.launcher.type = 'button'
    this.launcher.setAttribute('aria-label', 'Feedback')
    this.launcher.setAttribute('aria-expanded', 'false')
    this.launcher.title = 'Drag to move. Use arrow keys when focused.'
    this.launcher.setAttribute('aria-description', 'Drag to move, or use arrow keys. Enter opens feedback.')
    this.launcher.addEventListener('pointerdown', event => this.startDrag(event))
    this.launcher.addEventListener('pointermove', event => this.moveDrag(event))
    this.launcher.addEventListener('pointerup', event => {
      if (event.pointerId === this.drag?.pointerId) this.endDrag(false)
    })
    this.launcher.addEventListener('pointercancel', (event) => {
      if (event.pointerId === this.drag?.pointerId) this.endDrag(true)
    })
    this.launcher.addEventListener('lostpointercapture', (event) => {
      if (event.pointerId === this.drag?.pointerId) this.endDrag(true)
    })
    this.launcher.addEventListener('dragstart', event => event.preventDefault())
    this.launcher.addEventListener('contextmenu', (event) => { if (this.drag) event.preventDefault() })
    this.launcher.addEventListener('keydown', event => this.moveWithKeyboard(event))
    this.launcher.innerHTML = ICON
    const tabLabel = el('span', 'tab-label')
    tabLabel.textContent = 'Help'
    this.launcher.appendChild(tabLabel)
    this.badge = el('span', 'badge')
    this.badge.hidden = true
    this.badge.setAttribute('aria-live', 'polite')
    this.launcher.appendChild(this.badge)

    this.launcherClose = el('button', 'launcher-close')
    this.launcherClose.type = 'button'
    this.launcherClose.hidden = true
    const closeIcon = el('span', '')
    closeIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>'
    closeIcon.setAttribute('aria-hidden', 'true')
    this.launcherClose.appendChild(closeIcon)
    this.launcherClose.addEventListener('click', () => {
      const state = this.root.dataset.closeBehavior === 'hide' ? 'hidden' : 'tab'
      this.launcherStateHandler?.(state)
      if (!this.launcher.hidden && !this.root.hidden) this.launcher.focus({ preventScroll: true })
    })

    this.root.append(this.panel, this.launcher, this.launcherClose)
    shadow.appendChild(this.root)
  }

  mount(): void {
    document.body.appendChild(this.host)
    const resize = (): void => {
      this.endDrag(true)
      this.cancelLauncherMotion()
      this.layoutPosition()
    }
    window.addEventListener('resize', resize)
    window.visualViewport?.addEventListener('resize', resize)
    window.visualViewport?.addEventListener('scroll', resize)
    window.addEventListener('blur', () => this.endDrag(true))
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.endDrag(true)
    })
    this.layoutPosition()
  }

  onLauncherClick(handler: () => void): void {
    this.launcher.addEventListener('click', (event) => {
      if (this.suppressClick && event.detail !== 0) { event.preventDefault(); return }
      handler()
    })
  }

  onPositionChange(handler: (position: DockedPosition) => void): void {
    this.positionHandler = handler
  }

  private viewport() {
    const visual = window.visualViewport
    const style = getComputedStyle(this.root)
    const inset = (side: string): number => Number.parseFloat(style.getPropertyValue(`--safe-${side}`)) || 0
    const edgeLeft = visual?.offsetLeft ?? 0
    const edgeRight = edgeLeft + Math.min(visual?.width ?? Infinity, document.documentElement.clientWidth)
    const left = edgeLeft + inset('left') + 20
    const top = (visual?.offsetTop ?? 0) + inset('top') + 12
    return {
      left, top, edgeLeft, edgeRight,
      right: edgeRight - inset('right') - 20,
      bottom: (visual?.offsetTop ?? 0) + (visual?.height ?? document.documentElement.clientHeight) - inset('bottom') - 12,
    }
  }

  private launcherSize() {
    if (this.launcher.dataset.state !== 'tab') return { width: 56, height: 56 }
    // Layout uses the destination size so CSS morphing never moves the panel anchor.
    const inset = Number.parseFloat(getComputedStyle(this.root).getPropertyValue('--tab-safe-inset')) || 0
    return { width: 22 + inset, height: 56 }
  }

  private placeAt(left: number, top: number): void {
    const size = this.launcherSize()
    this.root.style.left = `${left - (this.root.dataset.alignment === 'right' ? 56 - size.width : 0)}px`
    this.root.style.top = `${top + size.height - 56}px`
    this.root.style.right = 'auto'
    this.root.style.bottom = 'auto'
  }

  private layoutPosition(): void {
    this.root.dataset.alignment = this.docked?.alignment ?? this.placement.alignment
    this.root.dataset.docked = String(!!this.docked)
    if (!this.docked) {
      for (const property of ['left', 'right', 'top', 'bottom']) this.root.style.removeProperty(property)
      if (this.launcher.dataset.state === 'tab' && this.host.isConnected) {
        const size = this.launcherSize(), view = this.viewport()
        const bottom = this.root.getBoundingClientRect().bottom
        const left = this.placement.alignment === 'left' ? view.edgeLeft : view.edgeRight - size.width
        this.placeAt(left, clamp(bottom - size.height, view.top, view.bottom - size.height))
      }
    }
    else {
      const size = this.launcherSize()
      const view = this.viewport()
      const tab = this.launcher.dataset.state === 'tab'
      const left = this.docked.alignment === 'left'
        ? (tab ? view.edgeLeft : view.left)
        : Math.max(view.edgeLeft, (tab ? view.edgeRight : view.right) - size.width)
      const top = view.top + Math.max(0, view.bottom - view.top - size.height) * this.docked.y
      this.placeAt(left, top)
    }
    this.layoutPanel()
  }

  private layoutPanel(): void {
    if (!this.host.isConnected) return
    const size = this.launcherSize()
    const view = this.viewport()
    const root = this.root.getBoundingClientRect()
    this.root.style.setProperty('--launcher-close-top', `${Math.max(-20, view.top - root.top)}px`)
    const alignment = this.docked?.alignment ?? this.placement.alignment
    // The host help entry can open feedback with the launcher itself hidden.
    const left = alignment === 'left' ? root.left : root.right - size.width
    const panel = panelPlacement(
      { left, right: left + size.width, top: root.bottom - size.height, bottom: root.bottom },
      { ...view, left: view.left - 8, right: view.right + 8 },
      alignment,
    )
    for (const field of ['left', 'top', 'width', 'height'] as const) {
      this.root.style.setProperty(`--panel-${field}`, `${panel[field]}px`)
    }
  }

  private startDrag(event: PointerEvent): void {
    if (!event.isPrimary || event.button !== 0 || this.isOpen || this.root.hidden || this.drag) return
    this.snapAnimation?.pause()
    this.suppressClick = false
    const rect = this.launcher.getBoundingClientRect()
    this.drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false }
    this.launcher.setPointerCapture(event.pointerId)
  }

  private moveDrag(event: PointerEvent): void {
    const drag = this.drag
    if (!drag || event.pointerId !== drag.pointerId) return
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < 8) return
    event.preventDefault()
    if (!drag.moved) {
      this.cancelLauncherMotion()
      drag.moved = true
      this.suppressClick = true
      this.root.dataset.dragging = 'true'
    }
    const view = this.viewport(), size = this.launcherSize()
    this.placeAt(clamp(drag.left + dx, view.left, view.right - size.width), clamp(drag.top + dy, view.top, view.bottom - size.height))
  }

  private endDrag(cancel: boolean): void {
    const drag = this.drag
    if (!drag) return
    const rect = this.launcher.getBoundingClientRect()
    this.drag = null
    delete this.root.dataset.dragging
    if (this.launcher.hasPointerCapture(drag.pointerId)) this.launcher.releasePointerCapture(drag.pointerId)
    if (!drag.moved) { this.snapAnimation?.play(); return }
    if (cancel) {
      this.layoutPosition()
      this.animateLauncherFrom(rect)
      return
    }
    const view = this.viewport()
    this.positionHandler?.({
      alignment: rect.left + rect.width / 2 < (view.left + view.right) / 2 ? 'left' : 'right',
      y: clamp((rect.top - view.top) / Math.max(1, view.bottom - view.top - rect.height), 0, 1),
    })
    this.animateLauncherFrom(rect)
  }

  private cancelLauncherMotion(): void {
    this.snapAnimation?.cancel()
    this.snapAnimation = null
    delete this.root.dataset.snapping
  }

  private animateLauncherFrom(before: DOMRect): void {
    this.cancelLauncherMotion()
    if (!this.host.isConnected || this.root.hidden || this.launcher.hidden
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const target = this.root.getBoundingClientRect()
    // Keep the outer edge continuous while CSS changes the launcher's width.
    const dx = this.root.dataset.alignment === 'left' ? before.left - target.left : before.right - target.right
    const dy = before.bottom - target.bottom
    if (Math.abs(dx) < .5 && Math.abs(dy) < .5) return
    this.root.dataset.snapping = 'true'
    const animation = this.launcher.animate([
      { transform: `translate(${dx}px, ${dy}px)` },
      { transform: 'none' },
    ], { duration: 220, easing: 'cubic-bezier(.22, 1, .36, 1)' })
    this.snapAnimation = animation
    const finish = (): void => {
      if (this.snapAnimation !== animation) return
      this.snapAnimation = null
      delete this.root.dataset.snapping
    }
    animation.onfinish = finish
    animation.oncancel = finish
  }

  private moveWithKeyboard(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.drag) { event.preventDefault(); this.endDrag(true); return }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) || this.isOpen || this.root.hidden
      || event.altKey || event.ctrlKey || event.metaKey || this.drag) return
    event.preventDefault()
    const rect = this.launcher.getBoundingClientRect(), view = this.viewport()
    const alignment = event.key === 'ArrowLeft' ? 'left' : event.key === 'ArrowRight' ? 'right' : this.root.dataset.alignment as 'left' | 'right'
    const top = rect.top + (event.key === 'ArrowUp' ? -24 : event.key === 'ArrowDown' ? 24 : 0)
    this.positionHandler?.({ alignment, y: clamp((top - view.top) / Math.max(1, view.bottom - view.top - rect.height), 0, 1) })
    this.animateLauncherFrom(rect)
  }

  onLauncherStateChange(handler: (state: LauncherState) => void): void {
    this.launcherStateHandler = handler
  }

  get isOpen(): boolean {
    return !this.panel.hidden
  }

  openPanel(): void {
    this.endDrag(true)
    this.layoutPanel()
    if (!this.isOpen && document.activeElement instanceof HTMLElement && document.activeElement !== this.host) {
      this.returnFocus = document.activeElement
    }
    this.panel.hidden = false
    this.root.dataset.panelOpen = 'true'
    this.launcher.setAttribute('aria-expanded', 'true')
    this.focusPanel()
  }

  focusPanel(): void {
    if (this.root.hidden || !this.isOpen) return
    if (this.state.hidden) this.iframe?.focus({ preventScroll: true })
    else this.stateClose.focus({ preventScroll: true })
  }

  closePanel(restoreFocus = true): void {
    const wasOpen = this.isOpen
    this.panel.hidden = true
    this.root.dataset.panelOpen = 'false'
    this.launcher.setAttribute('aria-expanded', 'false')
    if (restoreFocus && wasOpen && !this.root.hidden) {
      if (!this.launcher.hidden) this.launcher.focus({ preventScroll: true })
      else if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true })
    }
  }

  setPlacement(value: LauncherPlacement, zIndex: number, position: DockedPosition | null = null): void {
    this.root.style.setProperty('--z-index', String(zIndex))
    if (value.alignment === this.placement.alignment && value.sideOffset === this.placement.sideOffset
      && value.bottomOffset === this.placement.bottomOffset && position?.alignment === this.docked?.alignment
      && position?.y === this.docked?.y) return
    this.endDrag(true)
    this.cancelLauncherMotion()
    this.placement = value
    this.docked = position
    this.root.style.setProperty('--side-offset', `${value.sideOffset}px`)
    this.root.style.setProperty('--bottom-offset', `${value.bottomOffset}px`)
    this.layoutPosition()
  }

  currentPlacement(): LauncherPlacement {
    if (!this.docked) return { ...this.placement }
    const view = this.viewport()
    return {
      alignment: this.docked.alignment,
      sideOffset: 20,
      bottomOffset: Math.round(12 + Math.max(0, view.bottom - view.top - 56) * (1 - this.docked.y)),
    }
  }

  setTheme(theme: WidgetTheme): void {
    this.theme = theme
    this.root.dataset.theme = theme === 'auto' ? (this.systemTheme.matches ? 'dark' : 'light') : theme
  }

  setLauncher(state: LauncherState, behavior: LauncherCloseBehavior): void {
    const previous = this.launcher.dataset.state
    const morph = previous !== state && previous !== undefined && previous !== 'hidden' && state !== 'hidden'
      && this.host.isConnected && !this.root.hidden && !this.launcher.hidden
    const before = morph ? this.launcher.getBoundingClientRect() : null
    this.root.dataset.launcherState = state
    this.launcher.dataset.state = state
    this.root.dataset.closeBehavior = behavior
    this.launcher.hidden = state === 'hidden'
    this.launcher.setAttribute('aria-label', state === 'tab' ? 'Help' : 'Feedback')
    this.launcherClose.hidden = this.launcher.hidden || state !== 'button' || behavior === 'none'
    const closeLabel = behavior === 'hide' ? 'Hide for now' : 'Minimize button'
    this.launcherClose.setAttribute('aria-label', closeLabel)
    this.launcherClose.title = closeLabel
    this.layoutPosition()
    if (before) this.animateLauncherFrom(before)
    else if (this.launcher.hidden) this.cancelLauncherMotion()
  }

  setHidden(hidden: boolean): void {
    if (hidden) {
      this.endDrag(true)
      this.cancelLauncherMotion()
    }
    if (hidden && document.activeElement === this.host) {
      const focused = this.host.shadowRoot?.activeElement
      if (focused instanceof HTMLElement) focused.blur()
    }
    this.root.hidden = hidden
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
    const focused = this.host.shadowRoot?.activeElement
    const moveFocus = this.isOpen && !this.root.hidden && !!focused && this.state.contains(focused)
    this.retryHandler = null
    this.state.hidden = true
    if (this.iframe) this.iframe.hidden = false
    if (moveFocus) this.iframe?.focus({ preventScroll: true })
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
