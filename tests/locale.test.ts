import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveLocale } from '../src/locale'
import { mergeDisplay, validateDisplay } from '../src/display'

test('automatic language follows browser preferences and only resolves existing translations', () => {
  assert.equal(resolveLocale(undefined, ['zh-CN', 'en-US']), 'zh')
  assert.equal(resolveLocale('auto', ['fr-FR', 'zh-TW', 'en']), 'zh')
  assert.equal(resolveLocale('auto', ['en-GB', 'zh-CN']), 'en')
  assert.equal(resolveLocale('auto', ['ko-KR', 'de-DE']), 'en')
  assert.equal(resolveLocale('auto', []), 'en')
})

test('explicit locale takes precedence, supports regional aliases and falls back to English', () => {
  assert.equal(resolveLocale('en-US', ['zh']), 'en')
  assert.equal(resolveLocale('ZH-cn', ['en']), 'zh')
  assert.equal(resolveLocale('zh-TW', ['en']), 'zh')
  assert.equal(resolveLocale('fr', ['zh']), 'en')
})

test('language updates preserve unrelated options and reject malformed input before changing state', () => {
  const original = { locale: 'zh', theme: 'dark' as const }
  assert.equal(mergeDisplay(original, { locale: undefined }).locale, 'zh')
  assert.equal(mergeDisplay(original, { locale: 'auto' }).theme, 'dark')
  for (const locale of ['auto', 'en', 'zh', 'zh-CN', 'zh-TW', 'en-US', 'fr']) assert.doesNotThrow(() => validateDisplay({ locale }))
  for (const locale of ['', 'zh_CN', null, 3]) assert.throws(() => validateDisplay({ locale } as never), TypeError)
})
