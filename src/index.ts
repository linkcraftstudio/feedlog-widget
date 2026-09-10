import type { WidgetOptions } from './types'
import { boot, type Widget } from './widget'

export type { WidgetAuth, WidgetOptions, WidgetTheme } from './types'

let created = false
let widget: Widget | null = null
/** True once boot settled, whether or not it produced a widget. */
let settled = false
let queued: 'open' | 'close' | null = null

/**
 * Mounts the FeedLog feedback widget. Call it once; drive it afterwards with
 * `openWidget()` / `closeWidget()` if you want entry points of your own.
 */
export function createWidget(options: WidgetOptions): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  // Set before any await so React StrictMode's double-mount and HMR re-runs
  // cannot slip a second launcher through.
  if (created) {
    console.warn('[feedlog/widget] createWidget() was already called; ignoring this call')
    return
  }

  if (!options?.baseUrl || typeof options.baseUrl !== 'string') {
    throw new TypeError('[feedlog/widget] createWidget requires a baseUrl')
  }
  // Absent is fine — the widget then runs guest-only. Present but malformed is
  // not: that is a wiring mistake worth failing loudly on.
  if (options.auth !== undefined && typeof options.auth?.getToken !== 'function') {
    throw new TypeError('[feedlog/widget] auth.getToken must be a function')
  }

  const baseUrl = options.baseUrl.replace(/\/+$/, '')
  let origin: string
  try {
    origin = new URL(baseUrl).origin
  }
  catch {
    throw new TypeError(`[feedlog/widget] baseUrl is not a valid URL: ${options.baseUrl}`)
  }

  // A leading-slash, same-origin path only — reject anything that could point
  // the iframe at another origin (`//evil.com`, `https://…`).
  const rawPath = options.embedPath ?? '/widget/embed'
  const embedPath = (typeof rawPath === 'string' && rawPath.startsWith('/') && !rawPath.startsWith('//'))
    ? rawPath
    : '/widget/embed'

  created = true
  void boot({
    baseUrl,
    origin,
    auth: options.auth,
    theme: options.theme ?? 'auto',
    embedPath,
  }).then((mounted) => {
    widget = mounted
    settled = true
    if (mounted && queued) run(mounted, queued)
    queued = null
  })
}

/** Opens the panel, exactly as a click on the launcher would. */
export function openWidget(): void {
  command('open')
}

export function closeWidget(): void {
  command('close')
}

function command(kind: 'open' | 'close'): void {
  if (!created) {
    console.warn(`[feedlog/widget] ${kind}Widget() called before createWidget(); ignoring`)
    return
  }
  if (widget) {
    run(widget, kind)
    return
  }
  // Still booting: replay once it mounts. Already settled without a widget
  // (disabled, or config unreachable) means there is nothing to drive.
  if (!settled) queued = kind
}

function run(target: Widget, kind: 'open' | 'close'): void {
  if (kind === 'open') void target.open()
  else target.close()
}
