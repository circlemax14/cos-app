/**
 * COS-1251 — Sign in with Apple on Android, through Apple's web page.
 *
 * Apple answers with a form POST to the backend, which hands it back as
 * cos://auth/apple. Another app could claim that link, so Apple stamps the
 * token with sha256(nonce), only the app holds the nonce, and the backend
 * refuses the token without it (cos-backend verifyAppleToken).
 *
 * Contract tests over source read as text (no `@/` alias under node --test).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const social = strip(read('services/social-auth.ts'))
const web = social.slice(social.indexOf('async function signInWithAppleWeb'), social.indexOf('export async function signInWithApple'))

test('THE POINT: Android signs in with Apple through the web flow; iOS keeps the kit', () => {
  assert.match(social, /export async function signInWithApple\(\): Promise<AppleSignInResult> \{\s*if \(Platform\.OS === 'android'\) return signInWithAppleWeb\(\);\s*const credential = await AppleAuthentication\.signInAsync/)
})

test("Apple's page is asked for what the backend callback expects", () => {
  assert.match(web, /client_id: 'ai\.circlesupporthealth\.csh\.web'/, 'the Services ID the backend accepts (clientId + .web)')
  assert.match(web, /redirect_uri: `\$\{API_BASE\.replace\(\/\\\/\+\$\/, ''\)\}\/v1\/auth\/social\/apple\/callback`/)
  assert.match(web, /response_mode: 'form_post'/, 'Apple requires form_post when asking for name/email')
  assert.match(web, /scope: 'name email'/)
})

test('the token is bound to this app: sha256(nonce) goes to Apple, the nonce goes to the backend', () => {
  assert.match(web, /nonce: await Crypto\.digestStringAsync\(Crypto\.CryptoDigestAlgorithm\.SHA256, nonce\)/)
  assert.match(web, /return \{\s*identityToken: p\.id_token,[\s\S]*nonce,\s*\}/)
  const signIn = strip(read('app/(auth)/sign-in.tsx'))
  assert.match(signIn, /const \{ identityToken, fullName, nonce \} = await signInWithApple\(\);\s*const res = await socialSignInWithBackend\('apple', \{ identityToken, fullName, nonce \}\)/)
  const linked = strip(read('app/Home/linked-accounts.tsx'))
  assert.match(linked, /const \{ identityToken, nonce \} = await signInWithApple\(\);\s*await linkProvider\('apple', identityToken, nonce\)/)
  assert.match(social, /apiClient\.post\('\/v1\/auth\/social\/link', \{ provider, idToken, nonce \}\)/)
})

test('an answer for another request is refused; cancelling reads as a cancel, like iOS', () => {
  assert.match(web, /if \(p\.state !== state\) throw/)
  assert.match(web, /if \(p\.error === 'user_cancelled_authorize'\) throw appleCancelled\(\)/)
  assert.match(web, /if \(!answer\) throw appleCancelled\(\)/)
  assert.match(social, /code: 'ERR_REQUEST_CANCELED'/, 'the code the screens already ignore')
})

test('the Android button is behind its own backend flag', () => {
  const signIn = strip(read('app/(auth)/sign-in.tsx'))
  assert.match(signIn, /const canUseAppleSignIn = isAppleSignInEnabled && \(Platform\.OS === 'ios' \|\| isAppleAndroidEnabled\)/)
  assert.match(signIn, /useIsFeatureFlagEnabled\('sign_in_with_apple_android'\)/)
  const linked = strip(read('app/Home/linked-accounts.tsx'))
  assert.match(linked, /useCanRender\('linked-accounts\.link-apple'\) && \(Platform\.OS === 'ios' \|\| isAppleAndroidEnabled\)/)
})

test("Apple's answer link is not treated as a screen", () => {
  const src = read('lib/deep-link-gate.ts') // MOB-01: decision moved out of app/+native-intent.ts
  const literal = src.match(/(\/\^\(\?:cos:.*?\$\)\/)\.test\(path\)\) return null/)
  assert.ok(literal, 'redirectSystemPath must return null for cos://auth/apple')
  const re = new RegExp(literal[1].slice(1, -1))
  assert.ok(re.test('cos://auth/apple?id_token=a&state=b'))
  assert.ok(re.test('/auth/apple?state=b'))
  assert.ok(!re.test('/auth/apples'))
  assert.ok(!re.test('/Home'))
})
