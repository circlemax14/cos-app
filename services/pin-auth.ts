import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { readSecureExpectingValue, readSecureWithRetry, writeSecure } from '@/lib/auth-tokens';
import { isKeychainLockedError } from '@/lib/keychain-locked';

const PIN_HASH_KEY = 'cos_pin_hash';
const BIOMETRIC_ENABLED_KEY = 'cos_biometric_enabled';
const PIN_SETUP_COMPLETE_KEY = 'cos_pin_setup_complete';
const FAILED_ATTEMPTS_KEY = 'cos_failed_pin_attempts';
const LOCK_TIMEOUT_KEY = 'cos_lock_timeout';

export async function hashPin(pin: string): Promise<string> {
  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    pin,
  );
}

export async function storePin(pin: string): Promise<void> {
  const hash = await hashPin(pin);
  await writeSecure(PIN_HASH_KEY, hash);
  await writeSecure(PIN_SETUP_COMPLETE_KEY, 'true');
  await resetFailedAttempts();
}

/**
 * Constant-time string comparison. JavaScript's === short-circuits on
 * first mismatched byte, which leaks information through timing. For a
 * PIN hash (where attacker only ever controls the input to be hashed,
 * not the bytes compared) this is extremely low-risk in practice but
 * cheap to harden. SCRUM-279 (build 44).
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function verifyPin(pin: string): Promise<boolean> {
  // COS-1275: raw read on purpose — a read that fails must throw, never come
  // back as a wrong PIN that counts toward the five-attempt sign-out.
  const storedHash = await SecureStore.getItemAsync(PIN_HASH_KEY);
  if (!storedHash) return false;
  const inputHash = await hashPin(pin);
  return timingSafeEqual(storedHash, inputHash);
}

export async function isPinSetup(): Promise<boolean> {
  /*
   * COS-874 — a cold Keychain must not read as "this user has no PIN".
   *
   * Ken: "whenever I open the app, I see that the Internet is not available.
   * When I click retry, the app starts working."
   *
   * There is no connectivity check anywhere in this app — that screen is the
   * splash route's own gate state. The chain: on a cold launch the iOS
   * Keychain (items default to WHEN_UNLOCKED) is briefly unavailable and
   * getItemAsync returns null WITHOUT throwing. app/index.tsx then reads that
   * as `pinConfigured === false` for a user who does have a PIN, while the
   * cached profile in AsyncStorage still says a session should exist — the two
   * disagree, and the gate falls through to the error screen. Retry works
   * because by then the Keychain has settled.
   *
   * A single unretried read is the whole defect, and every one of the seven
   * isPinSetup() callers goes through here, so this is the one place to fix it.
   *
   * readSecureExpectingValue retries on NULL as well as on throw, which is the
   * case readSecureWithRetry misses (see its docstring in lib/auth-tokens.ts).
   * Its caveat applies: retrying on null costs a genuinely PIN-less launch
   * ~450ms of backoff. That is the right trade — the alternative is showing a
   * signed-in patient a false error screen on entry.
   */
  const result = await readSecureExpectingValue(PIN_SETUP_COMPLETE_KEY).catch(() => null);
  if (result === 'true') return true;
  /*
   * COS-1275 — a locked device hides the flag; it does not remove it.
   *
   * Answering "no PIN" there is the dangerous direction: SecurityProvider then
   * sets isLocked=false and disarms the app lock, and the splash routes a
   * signed-in patient to setup-pin, where anyone holding the iPad can choose a
   * new PIN. This key is only ever written as 'true', and a refused read means
   * an item matched — so fail closed.
   * ponytail: if iOS ever refuses a read for a key that is ABSENT, a signed-out
   * device launched while locked opens on the lock screen; Forgot PIN recovers.
   */
  return SecureStore.getItemAsync(PIN_SETUP_COMPLETE_KEY).then(
    (value) => value === 'true',
    isKeychainLockedError,
  );
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await writeSecure(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
}

export async function isBiometricEnabled(): Promise<boolean> {
  const result = await readSecureWithRetry(BIOMETRIC_ENABLED_KEY);
  return result === 'true';
}

export async function getFailedAttempts(): Promise<number> {
  // COS-1275: raw read on purpose, like verifyPin — a failed read must not reset the count.
  const result = await SecureStore.getItemAsync(FAILED_ATTEMPTS_KEY);
  return result ? parseInt(result, 10) : 0;
}

export async function incrementFailedAttempts(): Promise<number> {
  const current = await getFailedAttempts();
  const next = current + 1;
  await writeSecure(FAILED_ATTEMPTS_KEY, next.toString());
  return next;
}

export async function resetFailedAttempts(): Promise<void> {
  await writeSecure(FAILED_ATTEMPTS_KEY, '0');
}

export async function clearPinData(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_HASH_KEY);
  await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
  await SecureStore.deleteItemAsync(PIN_SETUP_COMPLETE_KEY);
  await SecureStore.deleteItemAsync(FAILED_ATTEMPTS_KEY);
}

export async function getLockTimeout(): Promise<number> {
  const result = await readSecureWithRetry(LOCK_TIMEOUT_KEY);
  // Default: lock IMMEDIATELY whenever the app leaves the foreground.
  // Healthcare app — minimize blast radius if the device is unlocked but
  // unattended. Users who want a grace period can set their own via
  // Security settings.
  return result ? parseInt(result, 10) : 0;
}

export async function setLockTimeout(ms: number): Promise<void> {
  await writeSecure(LOCK_TIMEOUT_KEY, ms.toString());
}
