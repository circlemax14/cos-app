import * as SecureStore from 'expo-secure-store';
import { clearEntitlementCache } from './entitlement-cache';

const KEYS = {
  access: 'cos_access_token',
  refresh: 'cos_refresh_token',
  id: 'cos_id_token',
} as const;

// In-memory token cache with single-flight reads.
//
// Background (SCRUM-181): the app crashes on iOS 26 (build 9) when the api
// client fires multiple parallel SecureStore reads from its axios interceptor
// — a known race in expo-modules-core Record/Mirror reflection during
// SecureStoreOptions conversion. Caching the token in memory + coalescing
// concurrent reads into a single SecureStore call eliminates the race.
//
// Lifecycle:
//   - First read: hit SecureStore, store the value in memory, return it.
//   - Subsequent reads: return from memory (synchronous, no native call).
//   - storeTokens / clearTokens update the in-memory cache eagerly.
//   - All concurrent first-reads share the same in-flight promise.
let cachedAccessToken: string | null | undefined = undefined;
let cachedRefreshToken: string | null | undefined = undefined;
let cachedIdToken: string | null | undefined = undefined;

let inFlightAccessRead: Promise<string | null> | null = null;
let inFlightRefreshRead: Promise<string | null> | null = null;
let inFlightIdRead: Promise<string | null> | null = null;

/**
 * Read a SecureStore key with a few short retries.
 *
 * COS-353: on a cold launch right after the device is unlocked, the iOS
 * Keychain (items default to WHEN_UNLOCKED) can be briefly inaccessible and
 * `getItemAsync` throws — plus there's the documented expo-modules-core read
 * race. A read FAILURE must never be interpreted as "no token": that wrongly
 * bounced returning users straight to the sign-in screen on the first launch
 * after a long background (SplashGate's catch → requestSignIn), while a
 * second launch — Keychain now warm — read the token fine and showed the PIN
 * screen. We retry across the transient post-unlock window; only a genuine
 * successful `null` means "no token". If every attempt throws we rethrow so
 * the caller can distinguish a real failure from an empty store.
 */
async function readSecureWithRetry(key: string, attempts = 3): Promise<string | null> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (err) {
      lastErr = err;
      // Back off and retry — the Keychain typically becomes available within
      // a few hundred ms of the device being unlocked.
      await new Promise((resolve) => setTimeout(resolve, 150 * (i + 1)));
    }
  }
  throw lastErr;
}

/**
 * Read a secure value, retrying when it comes back NULL as well as when it
 * throws.
 *
 * BUG #17, attempt 3 (Ken 2026-08-11: "when i opened app i was taken to sign
 * in screen and when i force close and open app again then i was taken to pin
 * screen").
 *
 * That second sentence is the whole diagnosis: the token EXISTS — the second
 * launch found it. The first launch did not. So this was never about which
 * token we read (attempt 2) or about the network (attempt 1); the read itself
 * comes back empty on a cold start and is believed.
 *
 * `readSecureWithRetry` above only retries when getItemAsync THROWS. On iOS
 * the Keychain-not-yet-available case frequently returns nil instead —
 * expo-secure-store surfaces that as a plain `null`, no error — so the retry
 * loop never engages and we conclude "no session" from a read that simply had
 * not settled.
 *
 * Retrying on null is only safe when we have corroborating evidence that a
 * session SHOULD exist, otherwise every genuinely signed-out launch pays the
 * backoff for nothing. The caller supplies that evidence.
 */
export async function readSecureExpectingValue(key: string, attempts = 3): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    const value = await readSecureWithRetry(key, 1).catch(() => null);
    if (value !== null && value.length > 0) return value;
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 150 * (i + 1)));
    }
  }
  return null;
}

/**
 * Whether a session exists — with an explicit "could not tell" arm.
 *
 * `hasStoredSession()` returns a boolean, which means "no token" and "could
 * not read the token" collapse to the same value, and the splash gate signs
 * the user out for both. The NETWORK path already learned this lesson —
 * checkSession() has an `indeterminate` reason and the splash explicitly
 * refuses to sign out on it. The LOCAL-READ path never got the equivalent,
 * and that is the gap this closes.
 */
export type SessionPresence = 'present' | 'absent' | 'indeterminate';

export async function readSessionPresence(
  opts: { expectSession?: boolean } = {},
): Promise<SessionPresence> {
  const read = opts.expectSession ? readSecureExpectingValue : (k: string) =>
    readSecureWithRetry(k).catch(() => null);

  const [access, refresh] = await Promise.all([read(KEYS.access), read(KEYS.refresh)]);
  if ((refresh?.length ?? 0) > 0 || (access?.length ?? 0) > 0) {
    // Warm the module cache so the very next getRefreshToken() is free.
    if (refresh) cachedRefreshToken = refresh;
    if (access) cachedAccessToken = access;
    return 'present';
  }

  // Both empty. If the caller had reason to believe a session exists (a PIN is
  // configured, or a cached profile is on disk), an empty read is far more
  // likely to be a Keychain that has not woken up than a real sign-out — say
  // so rather than forcing a sign-in.
  return opts.expectSession ? 'indeterminate' : 'absent';
}

export async function storeTokens(
  accessToken: string,
  refreshToken: string,
  idToken: string,
): Promise<void> {
  cachedAccessToken = accessToken;
  cachedRefreshToken = refreshToken;
  cachedIdToken = idToken;
  await Promise.all([
    SecureStore.setItemAsync(KEYS.access, accessToken),
    SecureStore.setItemAsync(KEYS.refresh, refreshToken),
    SecureStore.setItemAsync(KEYS.id, idToken),
  ]);
}

export async function getAccessToken(): Promise<string | null> {
  if (cachedAccessToken !== undefined) return cachedAccessToken;
  if (inFlightAccessRead) return inFlightAccessRead;
  inFlightAccessRead = readSecureWithRetry(KEYS.access)
    .then((value) => {
      cachedAccessToken = value;
      return value;
    })
    .finally(() => {
      inFlightAccessRead = null;
    });
  return inFlightAccessRead;
}

export async function getRefreshToken(): Promise<string | null> {
  if (cachedRefreshToken !== undefined) return cachedRefreshToken;
  if (inFlightRefreshRead) return inFlightRefreshRead;
  inFlightRefreshRead = readSecureWithRetry(KEYS.refresh)
    .then((value) => {
      cachedRefreshToken = value;
      return value;
    })
    .finally(() => {
      inFlightRefreshRead = null;
    });
  return inFlightRefreshRead;
}

export async function getIdToken(): Promise<string | null> {
  if (cachedIdToken !== undefined) return cachedIdToken;
  if (inFlightIdRead) return inFlightIdRead;
  inFlightIdRead = readSecureWithRetry(KEYS.id)
    .then((value) => {
      cachedIdToken = value;
      return value;
    })
    .finally(() => {
      inFlightIdRead = null;
    });
  return inFlightIdRead;
}

export async function clearTokens(): Promise<void> {
  cachedAccessToken = null;
  cachedRefreshToken = null;
  cachedIdToken = null;
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.access),
    SecureStore.deleteItemAsync(KEYS.refresh),
    SecureStore.deleteItemAsync(KEYS.id),
  ]);

  // COS-727 — the paid gate falls back to the device's last-known entitlements
  // when offline. Those belong to whoever was signed in, so leaving them behind
  // would hand the NEXT account the previous one's paid features. Cleared here
  // rather than in signOut() because this is the one function every
  // credential-clearing path funnels through (sign-out, 401 refresh failure,
  // the lock screen's five-attempt bailout and Forgot-PIN).
  //
  // Best-effort: a storage failure must not turn signing out into an error.
  try {
    await clearEntitlementCache();
  } catch {
    // The in-memory half is already cleared, which is what protects this session.
  }
}

/** Returns true if an access token is stored (does not validate expiry). */
export async function hasStoredSession(): Promise<boolean> {
  // Ken 2026-08-07: "why does the sign-in screen come when I open the app
  // every day or after a few hours?"
  //
  // This used to check the ACCESS token — which Cognito expires after 60
  // MINUTES. The refresh token is the one that defines whether a session
  // exists, and ours is valid for 30 DAYS. Deciding "is this person signed
  // in?" from the 60-minute credential is wrong by construction: it answers
  // "is my current access token fresh?", not "am I signed in?".
  //
  // The splash gate calls this BEFORE anything that could refresh, so a
  // false here routes straight to sign-in without the 401-refresh
  // interceptor ever getting a chance to run.
  //
  // A session exists if we can still MINT an access token. Accept either
  // token being present so a client mid-refresh is never mis-read as
  // signed out.
  const [access, refresh] = await Promise.all([getAccessToken(), getRefreshToken()]);
  return (
    (refresh !== null && refresh.length > 0) || (access !== null && access.length > 0)
  );
}
