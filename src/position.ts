export interface DockedPosition {
  alignment: 'left' | 'right'
  /** Relative travel keeps the launcher reachable after rotation or resizing. */
  y: number
}

export function readPosition(raw: string | null): DockedPosition | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<DockedPosition> | null
    if (!value || (value.alignment !== 'left' && value.alignment !== 'right')
      || typeof value.y !== 'number' || !Number.isFinite(value.y) || value.y < 0 || value.y > 1) return null
    return { alignment: value.alignment, y: value.y }
  }
  catch { return null }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, Math.max(min, max)))
}

interface Bounds {
  left: number
  right: number
  top: number
  bottom: number
}

export function panelPlacement(anchor: Bounds, view: Bounds, alignment: 'left' | 'right') {
  const gap = 16
  const minimumHeight = 480
  const maximumHeight = 680
  const above = anchor.top - view.top - gap
  const below = view.bottom - anchor.bottom - gap
  const width = Math.min(400, Math.max(0, view.right - view.left))
  const left = clamp(alignment === 'left' ? anchor.left : anchor.right - width, view.left, view.right - width)

  // Preserve the familiar above-launcher layout until it would compress the conversation.
  if (above >= minimumHeight) {
    const height = Math.min(maximumHeight, above)
    return { left, top: anchor.top - gap - height, width, height }
  }
  if (below >= minimumHeight) {
    return { left, top: anchor.bottom + gap, width, height: Math.min(maximumHeight, below) }
  }

  const inwardLeft = alignment === 'left' ? anchor.right + gap : anchor.left - width - gap
  const oppositeLeft = alignment === 'left' ? anchor.left - width - gap : anchor.right + gap
  const fits = (candidate: number): boolean => candidate >= view.left && candidate + width <= view.right
  const height = Math.min(maximumHeight, Math.max(0, view.bottom - view.top))
  return {
    // Large side offsets can put the launcher against the opposite edge.
    left: fits(inwardLeft) ? inwardLeft : fits(oppositeLeft) ? oppositeLeft : left,
    top: clamp(anchor.bottom - height, view.top, view.bottom - height),
    width,
    height,
  }
}
