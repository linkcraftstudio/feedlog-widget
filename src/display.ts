import type { LauncherCloseBehavior, LauncherPlacement, LauncherState, WidgetDisplayOptions } from './types'

// Leave room for host dialogs that start at z-index 50.
export const DEFAULT_WIDGET_Z_INDEX = 40

export function mergeDisplay(current: WidgetDisplayOptions, update: WidgetDisplayOptions): WidgetDisplayOptions {
  return {
    theme: update.theme ?? current.theme,
    zIndex: update.zIndex ?? current.zIndex,
    launcher: {
      ...current.launcher,
      ...Object.fromEntries(Object.entries(update.launcher ?? {}).filter(([, value]) => value !== undefined)),
    },
  }
}

export function placement(input?: Partial<LauncherPlacement>): LauncherPlacement {
  return {
    alignment: input?.alignment === 'left' ? 'left' : 'right',
    bottomOffset: offset(input?.bottomOffset),
    sideOffset: offset(input?.sideOffset),
  }
}

function offset(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : 20
}

export function validateDisplay(options: WidgetDisplayOptions): void {
  const launcher = options.launcher
  if (launcher?.alignment !== undefined && launcher.alignment !== 'left' && launcher.alignment !== 'right') {
    throw new TypeError('[feedlog/widget] launcher.alignment must be left or right')
  }
  for (const field of ['bottomOffset', 'sideOffset'] as const) {
    const value = launcher?.[field]
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
      throw new TypeError(`[feedlog/widget] launcher.${field} must be a non-negative safe integer`)
    }
  }
  if (launcher?.state !== undefined && !['button', 'tab', 'hidden'].includes(launcher.state)) {
    throw new TypeError('[feedlog/widget] launcher.state must be button, tab or hidden')
  }
  if (options.theme !== undefined && !['light', 'dark', 'auto'].includes(options.theme)) {
    throw new TypeError('[feedlog/widget] theme must be light, dark or auto')
  }
  if (options.zIndex !== undefined && (!Number.isInteger(options.zIndex) || options.zIndex < 0 || options.zIndex > 2147483647)) {
    throw new TypeError('[feedlog/widget] zIndex must be an integer between 0 and 2147483647')
  }
}

export function closeBehavior(value: unknown): LauncherCloseBehavior {
  if (value === 'none') return 'none'
  if (value === 'hide') return 'hide'
  return 'collapse'
}

export function launcherState(value: unknown, behavior: LauncherCloseBehavior): LauncherState {
  if (behavior === 'none') return 'button'
  if (value === 'tab' || (value === 'hidden' && behavior === 'hide')) return value
  return 'button'
}

export function restoredLauncherState(value: unknown, behavior: LauncherCloseBehavior): LauncherState {
  // Older SDKs stored hidden preferences; refreshing must now recover the button.
  return launcherState(value === 'hidden' ? 'button' : value, behavior)
}
