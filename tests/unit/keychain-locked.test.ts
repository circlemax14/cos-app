/**
 * COS-1275 (Sentry COS-APP-4) — a Keychain read refused because the iPad is
 * locked is "not now", never "no token" / "no PIN", and never an unhandled
 * rejection. Wiring is checked as source (no `@/` alias under node --test).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { isKeychainLockedError } from '../../lib/keychain-locked.ts';

const SENTRY_MESSAGE =
  "Calling the 'getValueWithKeyAsync' function has failed\n→ Caused by: User interaction is not allowed.";

test('recognises the locked-Keychain error exactly as Sentry reported it', () => {
  assert.equal(isKeychainLockedError(new Error(SENTRY_MESSAGE)), true);
  class CodedError extends Error {}
  assert.equal(isKeychainLockedError(new CodedError(SENTRY_MESSAGE)), true);
});

test('does not swallow other SecureStore failures', () => {
  for (const msg of [
    "Calling the 'getValueWithKeyAsync' function has failed\n→ Caused by: Invalid key",
    'Could not find the encryption scheme used for key: cos_access_token',
    'Unknown Keychain Error.',
  ]) {
    assert.equal(isKeychainLockedError(new Error(msg)), false, msg);
  }
  assert.equal(isKeychainLockedError(null), false);
  assert.equal(isKeychainLockedError('User interaction is not allowed.'), false);
});

const root = new URL('../../', import.meta.url);
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const src = (p: string) => strip(readFileSync(new URL(p, root), 'utf8'));

test('the shared read returns null for a locked device instead of throwing', () => {
  const tokens = src('lib/auth-tokens.ts');
  const fn = tokens.slice(tokens.indexOf('export async function readSecureWithRetry('));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /if \(isKeychainLockedError\(lastErr\)\) return null;\s*throw lastErr;/);
});

test('every SecureStore write goes through writeSecure with AFTER_FIRST_UNLOCK', () => {
  const offenders: string[] = [];
  for (const dir of ['app', 'components', 'hooks', 'lib', 'services', 'stores']) {
    for (const f of readdirSync(new URL(dir, root), { recursive: true }) as string[]) {
      if (!/\.tsx?$/.test(f) || f.includes('__tests__')) continue;
      const path = `${dir}/${f}`;
      const n = (src(path).match(/setItemAsync\(/g) ?? []).length;
      if (n && path !== 'lib/auth-tokens.ts') offenders.push(path);
    }
  }
  assert.deepEqual(offenders, [], 'write through writeSecure() so the item stays readable while locked');
  const tokens = src('lib/auth-tokens.ts');
  assert.equal((tokens.match(/setItemAsync\(/g) ?? []).length, 1);
  assert.match(tokens, /setItemAsync\(key, value, \{ keychainAccessible: SecureStore\.AFTER_FIRST_UNLOCK \}\)/);
});

test('reads reachable from a background launch cannot throw the locked error', () => {
  const pin = src('services/pin-auth.ts');
  assert.match(pin, /isBiometricEnabled[\s\S]*?readSecureWithRetry\(BIOMETRIC_ENABLED_KEY\)/);
  assert.match(pin, /getLockTimeout[\s\S]*?readSecureWithRetry\(LOCK_TIMEOUT_KEY\)/);
  // ...and a locked PIN flag means "PIN set" — "no PIN" disarms the app lock.
  const isPinSetup = pin.slice(pin.indexOf('export async function isPinSetup('));
  assert.match(isPinSetup.slice(0, isPinSetup.indexOf('\n}\n')), /isKeychainLockedError,?\s*\)/);
});
