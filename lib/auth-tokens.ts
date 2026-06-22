import * as SecureStore from 'expo-secure-store';

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
}

/** Returns true if an access token is stored (does not validate expiry). */
export async function hasStoredSession(): Promise<boolean> {
  const token = await getAccessToken();
  return token !== null && token.length > 0;
}
