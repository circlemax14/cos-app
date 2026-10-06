/**
 * COS-1244 — signing in on a device with no PIN sets one up NOW.
 *
 * app/index.tsx sends a PIN-less device to setup-pin on every cold start, but
 * the sign-in funnel went straight to Home. A returning patient signing in after
 * a reinstall skipped PIN + face unlock, and the next launch demanded both
 * (Vishal, Android build 73, 2026-10-06). Source read as text (no `@/` alias).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('THE POINT: sign-in checks for a PIN before it lands on Home', () => {
  const src = strip(read('app/(auth)/sign-in.tsx'))
  const route = src.slice(src.indexOf('const handleRoute = async'))
  const pin = route.indexOf('if (!(await isPinSetup()))')
  const home = route.indexOf("router.replace((deferredAfterSignIn ?? '/Home') as never)")
  assert.ok(pin > 0, 'handleRoute must check for a PIN')
  assert.ok(pin < home, 'the PIN check must come before Home')
  assert.match(route.slice(pin, home), /router\.replace\('\/\(security\)\/setup-pin' as never\)/)
})

test('it is the same rule the splash applies on a cold start', () => {
  assert.match(strip(read('app/index.tsx')), /if \(!pinConfigured\) return '\/\(security\)\/setup-pin'/)
})
