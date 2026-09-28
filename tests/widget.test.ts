import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import test from 'node:test'
import { Widget } from '../src/widget'
import { sessionStore } from '../src/storage'
import type { WidgetUi } from '../src/ui'
import type { LauncherCloseBehavior, LauncherState, WidgetAuth, WidgetOptions } from '../src/types'
import { readPosition, type DockedPosition } from '../src/position'

type FrameMessage = { v: number, type: string, payload?: Record<string, unknown> }

let sequence = 0

function harness(auth?: WidgetAuth, options: Partial<WidgetOptions> = {}, behavior: LauncherCloseBehavior = 'collapse') {
  const events = new EventTarget()
  Object.assign(events, { location: { origin: 'https://host.test', pathname: '/' } })
  Object.defineProperty(globalThis, 'window', { value: events, configurable: true })
  Object.defineProperty(globalThis, 'document', { value: new EventTarget(), configurable: true })
  Object.defineProperty(globalThis, 'navigator', { value: { connection: { saveData: true } }, configurable: true })
  const sent: { message: FrameMessage, origin: string }[] = []
  const source = { postMessage(message: FrameMessage, origin: string) { sent.push({ message, origin }) } }
  let changeLauncher!: (state: LauncherState) => void
  let moveLauncher!: (position: DockedPosition) => void
  let clickLauncher!: () => void
  const ui = {
    isOpen: false,
    hasIframe: true,
    frameWindow: source,
    hidden: false,
    state: 'button',
    theme: 'auto',
    zIndex: 0,
    restoredFocus: false,
    position: null as DockedPosition | null,
    placement: null as unknown,
    focused: 0,
    mount() {},
    onLauncherClick(handler: () => void) { clickLauncher = handler },
    onLauncherStateChange(handler: (state: LauncherState) => void) { changeLauncher = handler },
    onPositionChange(handler: (position: DockedPosition) => void) { moveLauncher = handler },
    setBadge() {},
    showError() { throw new Error('Unexpected loading error') },
    openPanel() { this.isOpen = true },
    closePanel(restoreFocus = true) { this.isOpen = false; this.restoredFocus = restoreFocus },
    focusPanel() { this.focused++ },
    setHidden(value: boolean) { this.hidden = value },
    setLauncher(state: string) { this.state = state },
    setTheme(theme: string) { this.theme = theme },
    setPlacement(value: unknown, zIndex: number, position: DockedPosition | null) { this.placement = value; this.position = position; this.zIndex = zIndex },
    currentPlacement() { return { alignment: this.position?.alignment ?? 'right', bottomOffset: 300, sideOffset: 20 } },
    showLoading() {},
    showContent() {},
    setIframe() { this.hasIframe = true },
  }
  const origin = `https://feedlog-${++sequence}.test`
  const widget = new Widget({ baseUrl: origin, origin, theme: 'auto', embedPath: '/widget/embed', auth, ...options }, ui as unknown as WidgetUi, { alignment: 'right', bottomOffset: 20, sideOffset: 20 }, behavior)
  widget.start()
  function message(type: string, payload?: unknown, overrides: Record<string, unknown> = {}) {
    const event = new Event('message')
    Object.assign(event, { origin, source, data: { v: 1, type, payload }, ...overrides })
    events.dispatchEvent(event)
  }
  return { widget, ui, message, sent, origin, clickLauncher: () => clickLauncher(), changeLauncher: (state: LauncherState) => changeLauncher(state), moveLauncher: (position: DockedPosition) => moveLauncher(position) }
}

async function settled() {
  await setImmediate()
  await setImmediate()
}

test('clicking a collapsed tab restores the button, opens feedback and retains position across reload', async () => {
  const baseUrl = 'https://tab-recovery.test'
  const { widget, ui, changeLauncher, clickLauncher, moveLauncher } = harness(undefined, { baseUrl })
  moveLauncher({ alignment: 'left', y: 0.4 })
  changeLauncher('tab')
  assert.equal(ui.isOpen, false)
  clickLauncher()
  await settled()
  assert.equal(ui.state, 'button')
  assert.equal(ui.isOpen, true)
  widget.close()
  assert.equal(ui.state, 'button')
  const reloaded = harness(undefined, { baseUrl })
  assert.equal(reloaded.ui.state, 'button')
  assert.deepEqual(reloaded.ui.position, { alignment: 'left', y: 0.4 })
})

test('disallowing closure clears old preferences and blocks new closing actions', () => {
  const baseUrl = 'https://close-policy.test'
  harness(undefined, { baseUrl }).changeLauncher('tab')
  const { ui, changeLauncher } = harness(undefined, { baseUrl }, 'none')
  assert.equal(ui.state, 'button')
  changeLauncher('tab')
  changeLauncher('hidden')
  assert.equal(ui.state, 'button')
  assert.equal(harness(undefined, { baseUrl }).ui.state, 'button')
})

test('hiding needs no recovery entry and the launcher returns on reload', () => {
  const baseUrl = 'https://hide-until-refresh.test'
  const { ui, changeLauncher } = harness(undefined, { baseUrl }, 'hide')
  changeLauncher('hidden')
  assert.equal(ui.state, 'hidden')
  assert.equal(harness(undefined, { baseUrl }, 'hide').ui.state, 'button')
})

test('collapsed tabs survive reload, but hiding clears a previous collapsed preference', () => {
  const baseUrl = 'https://persist-collapsed.test'
  harness(undefined, { baseUrl }).changeLauncher('tab')
  const { ui, changeLauncher } = harness(undefined, { baseUrl }, 'hide')
  assert.equal(ui.state, 'tab')
  changeLauncher('hidden')
  assert.equal(ui.state, 'hidden')
  assert.equal(harness(undefined, { baseUrl }, 'hide').ui.state, 'button')
})

test('legacy hidden preferences are cleared on reload', () => {
  const baseUrl = 'https://legacy-hidden.test'
  sessionStore().set(`feedlog:widget:launcher:${baseUrl}`, 'hidden')
  assert.equal(harness(undefined, { baseUrl }, 'hide').ui.state, 'button')
  assert.equal(sessionStore().get(`feedlog:widget:launcher:${baseUrl}`), 'button')
})

test('void login remains visible, rechecks identity and preserves callback binding', async () => {
  let logins = 0
  let tokens = 0
  const auth: WidgetAuth = {
    async getToken() { assert.equal(this, auth); tokens++; return null },
    login() { assert.equal(this, auth); logins++ },
  }
  const { widget, ui, message } = harness(auth)
  await widget.open()
  const before = tokens
  message('auth-requested', { reason: 'user' })
  message('auth-requested', { reason: 'user' })
  await settled()
  assert.equal(logins, 1)
  assert.equal(tokens, before + 2)
  assert.equal(ui.hidden, false)
  assert.equal(ui.isOpen, true)
  assert.equal(ui.focused, 0)
})

test('Promise login hides until exit and respects panel closure during login', async () => {
  let finish!: () => void
  let logins = 0
  const { widget, ui, message } = harness({
    async getToken() { return null },
    login() { logins++; return new Promise<void>(resolve => { finish = resolve }) },
  })
  await widget.open()
  message('auth-requested', { reason: 'user' })
  message('auth-requested', { reason: 'user' })
  await settled()
  assert.equal(logins, 1)
  assert.equal(ui.hidden, true)
  widget.close()
  widget.update({ launcher: { state: 'hidden' } })
  finish()
  await settled()
  assert.equal(ui.hidden, false)
  assert.equal(ui.isOpen, false)
  assert.equal(ui.state, 'hidden')
  assert.equal(ui.restoredFocus, false)
})

test('Promise rejection exits login without launching another login', async () => {
  let reject!: () => void
  let logins = 0
  const { widget, ui, message } = harness({
    async getToken() { return null },
    login() { logins++; return new Promise<void>((_, fail) => { reject = () => fail(new Error('Cancelled')) }) },
  })
  await widget.open()
  message('auth-requested', { reason: 'user' })
  await settled()
  assert.equal(ui.hidden, true)
  reject()
  await settled()
  assert.equal(ui.hidden, false)
  assert.equal(ui.isOpen, true)
  assert.equal(logins, 1)
})

test('completion from an earlier login cannot finish a later login', async () => {
  const completions: (() => void)[] = []
  const { widget, ui, message } = harness({
    async getToken() { return null },
    login() { return new Promise<void>(resolve => { completions.push(resolve) }) },
  })
  await widget.open()
  message('auth-requested', { reason: 'user' })
  await settled()
  completions[0]!()
  await settled()
  message('auth-requested', { reason: 'user' })
  await settled()
  assert.equal(completions.length, 2)
  completions[0]!()
  await settled()
  assert.equal(ui.hidden, true)
  completions[1]!()
  await settled()
  assert.equal(ui.hidden, false)
})

test('silent authentication never opens a login dialog', async () => {
  let logins = 0
  const { widget, ui, message } = harness({
    async getToken() { return null },
    login() { logins++ },
  })
  await widget.open()
  message('auth-requested', { reason: 'expired' })
  await settled()
  assert.equal(logins, 0)
  assert.equal(ui.hidden, false)
})

test('panel controls and unrelated updates preserve launcher preferences', async () => {
  const { widget, ui, changeLauncher } = harness(undefined, {}, 'hide')
  await widget.open()
  changeLauncher('hidden')
  assert.equal(ui.isOpen, true)
  await widget.open()
  widget.update({ zIndex: 100, theme: 'dark' })
  widget.close()
  assert.equal(ui.state, 'hidden')
  widget.update({ launcher: { state: 'tab' } })
  await widget.open()
  widget.close()
  assert.equal(ui.state, 'tab')
  widget.update({ launcher: { state: 'button' } })
  assert.equal(ui.state, 'button')
  assert.equal(ui.isOpen, false)
})

test('iframe messages cannot change launcher preferences or bypass dashboard policy', () => {
  const { ui, message, changeLauncher } = harness()
  changeLauncher('hidden')
  assert.equal(ui.state, 'button')
  message('launcher-request', { state: 'tab' }, { origin: 'https://untrusted.test' })
  assert.equal(ui.state, 'button')
  message('launcher-request', { state: 'tab' }, { source: {} })
  assert.equal(ui.state, 'button')
  message('launcher-request', { state: 'tab' })
  assert.equal(ui.state, 'button')
  changeLauncher('tab')
  assert.equal(ui.state, 'tab')
})

test('explicit host state works independently of visitor closing policy', async () => {
  const { widget, ui } = harness(undefined, { launcher: { state: 'hidden' } }, 'none')
  assert.equal(ui.state, 'hidden')
  await widget.open()
  assert.equal(ui.isOpen, true)
  assert.equal(ui.state, 'hidden')
  widget.update({ launcher: { state: 'tab' } })
  assert.equal(ui.state, 'tab')
  widget.close()
  widget.update({ launcher: { state: 'button' } })
  assert.equal(ui.state, 'button')
  assert.equal(ui.isOpen, false)
})

test('only explicit position updates replace a saved drag and retain unmodified placement', () => {
  const baseUrl = 'https://position-session.test'
  const { widget, ui, moveLauncher } = harness(undefined, { baseUrl })
  moveLauncher({ alignment: 'left', y: 0.25 })
  widget.update({ launcher: { state: 'tab' }, zIndex: 80 })
  assert.deepEqual(ui.position, { alignment: 'left', y: 0.25 })
  assert.deepEqual(harness(undefined, { baseUrl }).ui.position, ui.position)
  widget.update({ launcher: { bottomOffset: 2001 } })
  assert.deepEqual(ui.placement, { alignment: 'left', bottomOffset: 2001, sideOffset: 20 })
  assert.equal(ui.position, null)
  assert.equal(harness(undefined, { baseUrl }).ui.position, null)
  assert.equal(ui.state, 'tab')
})

test('theme updates wait for a trusted capable frame and preserve panel state', async () => {
  const { widget, ui, message, sent, origin } = harness()
  await widget.open()
  widget.update({ theme: 'dark' })
  assert.equal(ui.theme, 'auto')
  message('ready', { capabilities: { theme: true } }, { origin: 'https://untrusted.test' })
  message('ready', { capabilities: { theme: true } }, { source: {} })
  assert.equal(sent.length, 0)
  message('ready', { capabilities: { theme: true } })
  assert.deepEqual(sent.at(-1), { message: { v: 1, type: 'set-theme', payload: { theme: 'dark' } }, origin })
  assert.equal(ui.theme, 'dark')
  assert.equal(ui.isOpen, true)
  widget.update({ theme: 'auto' })
  assert.equal(ui.theme, 'auto')
  assert.equal(ui.isOpen, true)
})

test('old frames keep a consistent theme without remounting', () => {
  const { widget, ui, message, sent } = harness()
  message('ready')
  const warnings: unknown[][] = []
  const warn = console.warn
  console.warn = (...args) => { warnings.push(args) }
  try { widget.update({ theme: 'dark', zIndex: 60 }) }
  finally { console.warn = warn }
  assert.equal(warnings.length, 1)
  assert.equal(ui.theme, 'auto')
  assert.equal(ui.zIndex, 60)
  assert.equal(sent.some(item => item.message.type === 'set-theme'), false)
  assert.equal(ui.hasIframe, true)
})

test('stored positions accept only bounded ratios and left or right docking', () => {
  assert.deepEqual(readPosition('{"alignment":"left","y":0}'), { alignment: 'left', y: 0 })
  assert.deepEqual(readPosition('{"alignment":"right","y":1}'), { alignment: 'right', y: 1 })
  for (const raw of [null, '', 'null', 'invalid', '{"alignment":"center","y":0.5}', '{"alignment":"left","y":-1}', '{"alignment":"left","y":2}', '{"alignment":"right","y":"0.5"}']) {
    assert.equal(readPosition(raw), null)
  }
})
