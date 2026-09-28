import assert from 'node:assert/strict'
import test from 'node:test'
import { panelPlacement } from '../src/position'

const view = { left: 12, right: 1268, top: 12, bottom: 888 }

test('bottom launchers open above, aligned to their outer edge and capped at 680px', () => {
  for (const alignment of ['left', 'right'] as const) {
    const left = alignment === 'left' ? 20 : 1204
    const anchor = { left, right: left + 56, top: 812, bottom: 868 }
    const panel = panelPlacement(anchor, view, alignment)
    assert.equal(panel.top + panel.height, anchor.top - 16)
    assert.equal(panel.height, 680)
    assert.equal(alignment === 'left' ? panel.left : panel.left + panel.width, alignment === 'left' ? anchor.left : anchor.right)
  }
})

test('480px of clear space above is enough; one pixel less falls back inward', () => {
  const anchor = { left: 1204, right: 1260, top: 508, bottom: 564 }
  const above = panelPlacement(anchor, view, 'right')
  assert.equal(above.height, 480)
  assert.equal(above.top, 12)
  const inward = panelPlacement({ ...anchor, top: 507, bottom: 563 }, view, 'right')
  assert.equal(inward.left + inward.width, anchor.left - 16)
  assert.equal(inward.height, 680)
})

test('top launchers open below when at least 480px is available', () => {
  const anchor = { left: 20, right: 56, top: 180, bottom: 244 }
  const panel = panelPlacement(anchor, view, 'left')
  assert.equal(panel.top, 260)
  assert.equal(panel.height, 628)
  assert.equal(panel.left, anchor.left)
  const boundary = panelPlacement({ ...anchor, top: 328, bottom: 392 }, view, 'left')
  assert.equal(boundary.height, 480)
  assert.equal(boundary.top, 408)
})

test('above wins when both directions have enough space', () => {
  const panel = panelPlacement({ left: 20, right: 76, top: 720, bottom: 776 }, { ...view, bottom: 1600 }, 'left')
  assert.equal(panel.top + panel.height, 704)
})

test('middle launchers open inward without intersecting the launcher or safe bounds', () => {
  const safeView = { left: 30, right: 1030, top: 42, bottom: 850 }
  for (const alignment of ['left', 'right'] as const) {
    const left = alignment === 'left' ? 38 : 966
    const anchor = { left, right: left + 56, top: 410, bottom: 466 }
    const panel = panelPlacement(anchor, safeView, alignment)
    assert.equal(panel.width, 400)
    assert.equal(panel.height, 680)
    assert.ok(panel.top >= safeView.top)
    assert.ok(panel.top + panel.height <= safeView.bottom)
    assert.ok(panel.left >= safeView.left)
    assert.ok(panel.left + panel.width <= safeView.right)
    if (alignment === 'left') assert.equal(panel.left, anchor.right + 16)
    else assert.equal(panel.left + panel.width, anchor.left - 16)
  }
})

test('large side offsets and narrow desktop viewports retain a usable panel width', () => {
  for (const alignment of ['left', 'right'] as const) {
    const left = alignment === 'left' ? 1150 : 74
    const panel = panelPlacement({ left, right: left + 56, top: 430, bottom: 486 }, view, alignment)
    assert.equal(panel.width, 400)
    assert.ok(panel.left >= view.left)
    assert.ok(panel.left + panel.width <= view.right)
  }
  const narrow = { left: 12, right: 588, top: 12, bottom: 688 }
  const panel = panelPlacement({ left: 280, right: 336, top: 320, bottom: 376 }, narrow, 'right')
  assert.equal(panel.width, 400)
  assert.ok(panel.left >= narrow.left)
  assert.ok(panel.left + panel.width <= narrow.right)
})
