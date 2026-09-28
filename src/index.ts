import type { WidgetDisplayOptions, WidgetOptions } from './types'
import { boot, type Widget } from './widget'
import { mergeDisplay, validateDisplay } from './display'

export type { LauncherOptions, LauncherPlacement, LauncherState, WidgetAuth, WidgetDisplayOptions, WidgetOptions, WidgetTheme } from './types'

let created = false
let widget: Widget | null = null
let pendingOpen: boolean | undefined
let pendingDisplay: WidgetDisplayOptions = {}

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
  validateDisplay(options)

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
    ...options,
    baseUrl,
    origin,
    auth: options.auth,
    theme: options.theme ?? 'auto',
    embedPath,
  }).then((instance) => {
    if (!instance) return
    widget = instance
    widget.update(pendingDisplay)
    widget.start(pendingOpen)
  })
}

export function openWidget(): void {
  if (typeof window === 'undefined') return
  pendingOpen = true
  void widget?.open()
}

export function closeWidget(): void {
  if (typeof window === 'undefined') return
  pendingOpen = false
  widget?.close()
}

export function updateWidget(options: WidgetDisplayOptions): void {
  if (typeof window === 'undefined') return
  validateDisplay(options)
  pendingDisplay = mergeDisplay(pendingDisplay, options)
  widget?.update(options)
}
