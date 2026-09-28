import assert from 'node:assert/strict'
import test from 'node:test'
import { closeBehavior, launcherState, restoredLauncherState } from '../src/display'

test('the dashboard controls closing without requiring a host recovery entry', () => {
  assert.equal(closeBehavior('hide'), 'hide')
  assert.equal(closeBehavior('collapse'), 'collapse')
  assert.equal(closeBehavior('none'), 'none')
  assert.equal(closeBehavior(undefined), 'collapse')
})

test('reload restores the launcher after hiding but retains collapsed tabs', () => {
  for (const behavior of ['none', 'collapse', 'hide'] as const) {
    assert.equal(restoredLauncherState('hidden', behavior), 'button')
  }
  assert.equal(restoredLauncherState('tab', 'collapse'), 'tab')
  assert.equal(restoredLauncherState('tab', 'hide'), 'tab')
  assert.equal(restoredLauncherState('tab', 'none'), 'button')
})

test('stored preferences cannot bypass a changed close policy', () => {
  for (const state of ['tab', 'hidden']) assert.equal(launcherState(state, 'none'), 'button')
  assert.equal(launcherState('hidden', 'collapse'), 'button')
  assert.equal(launcherState('tab', 'collapse'), 'tab')
  assert.equal(launcherState('hidden', 'hide'), 'hidden')
})
