/**
 * COS-1276 (SCRUM-817) — one copy of react-native-paper in the bundle.
 *
 * 'react-native-paper/babel' rewrites `import { X } from 'react-native-paper'`
 * to `react-native-paper/lib/module/...`. @expo/metro-config's transformer
 * leaves BABEL_ENV as the string "undefined" after every other file, so under
 * env.production the plugin ran on about half the files. The release bundle
 * then held src/ AND lib/module/ copies, each with its own PortalContext, and
 * every <Portal> from the copy the root PaperProvider was not built from threw
 * "forgot to wrap your root component with Provider". Sign-in (BlockingLoader)
 * and the profile drawer were taken down in production (Sentry COS-APP-G/H/J).
 *
 * Contract test over source read as text (no `@/` alias under node --test).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('the Paper babel plugin is not configured, so every import resolves to one copy', () => {
  assert.doesNotMatch(strip(read('babel.config.js')), /react-native-paper\/babel/)
})
