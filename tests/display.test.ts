import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeDisplay, placement, validateDisplay } from '../src/display'
import type { WidgetDisplayOptions } from '../src/types'

test('dashboard and host offsets above 200px reach layout unchanged', () => {
  for (const value of [0, 201, 2001, 10000, Number.MAX_SAFE_INTEGER]) {
    const launcher = { alignment: 'left' as const, bottomOffset: value, sideOffset: value }
    assert.doesNotThrow(() => validateDisplay({ launcher }))
    assert.deepEqual(placement(launcher), launcher)
  }
  assert.deepEqual(placement({ bottomOffset: 2001 }), { alignment: 'right', bottomOffset: 2001, sideOffset: 20 })
})

test('offsets reject invalid host input and use defaults for invalid bootstrap data', () => {
  for (const field of ['bottomOffset', 'sideOffset'] as const) {
    for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => validateDisplay({ launcher: { [field]: value } }), TypeError)
      assert.equal(placement({ [field]: value })[field], 20)
    }
  }
})

test('partial display updates preserve omitted nested fields and explicit zero values', () => {
  const current: WidgetDisplayOptions = { theme: 'dark', zIndex: 60, launcher: { alignment: 'left', bottomOffset: 80, state: 'tab' } }
  const updated = mergeDisplay(current, { theme: undefined, zIndex: 0, launcher: { bottomOffset: 0, alignment: undefined } })
  assert.deepEqual(updated, { theme: 'dark', locale: undefined, zIndex: 0, launcher: { alignment: 'left', bottomOffset: 0, state: 'tab' } })
  assert.equal(current.launcher?.bottomOffset, 80)
})

test('invalid themes and launcher states fail before changing the display', () => {
  for (const options of [{ theme: 'system' }, { launcher: { state: 'visible' } }, { zIndex: -1 }, { zIndex: 2147483648 }]) {
    assert.throws(() => validateDisplay(options as WidgetDisplayOptions), TypeError)
  }
})
