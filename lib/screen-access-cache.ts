/**
 * COS-1061 — the device's last-known screen map.
 *
 * ─── WHY THIS EXISTS ─────────────────────────────────────────────────
 *
 * Vishal: *"as of now all the features are available in the app and the app
 * opens until we load the plan, and based on the plan we hide or we hide those
 * screens — like calendar is not available in that plan but calendar option is
 * available till the time data is loading. So what I want you to do is show a
 * full page loader while the data is loading."*
 *
 * Holding the app behind a loader until the plan is known fixes the flash. On
 * its own it also introduces a worse failure: a patient with no signal now gets
 * a spinner and then an error instead of an app. Their medication list is
 * behind that screen.
 *
 * So the gate asks this first. A patient who has opened the app before has a
 * map on disk, and the app renders immediately from it — no loader, no flash,
 * no lockout — while the live fetch refreshes in the background. The loader is
 * for a genuine first run, which is the only time we truly do not know.
 *
 * NOT A SECURITY BOUNDARY, for the same reasons as entitlement-cache.ts: it is
 * AsyncStorage, and the server remains the authority on anything that costs
 * money or exposes PHI. It exists so the gate can be strict without being
 * hostile.
 *
 * Module-scoped rather than a provider: it is read during render by a hook that
 * cannot await, and a context buys nothing for one object with one writer.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
// Shared with the hook's decision table so the shape is validated in ONE
// place, and tested where React Native does not have to load.
import { isCachedScreenAccess } from './screen-visibility';

const KEY = 'csh-screen-access-last-known';

export interface CachedScreenAccess {
  /** route/featureKey → visible. Flattened: the gate only ever reads a boolean. */
  screens: Record<string, boolean>;
  /** featureKey → launched. Kept separate, because it outranks `screens`. */
  launched: Record<string, boolean>;
  /** When it was stored, so a very old map can be judged if that is ever wanted. */
  at: number;
}

let _cached: CachedScreenAccess | null = null;
let _hydrated = false;
let _inFlight: Promise<void> | null = null;

/** Synchronous view for render. `null` until hydrated — the honest state. */
export function readCachedScreenAccess(): CachedScreenAccess | null {
  return _cached;
}

export function isScreenAccessCacheHydrated(): boolean {
  return _hydrated;
}

/**
 * Load from disk once. Safe to call repeatedly and concurrently — later callers
 * await the first call rather than racing it.
 */
export function hydrateScreenAccessCache(): Promise<void> {
  if (_hydrated) return Promise.resolve();
  if (_inFlight) return _inFlight;

  _inFlight = (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isCachedScreenAccess(parsed)) _cached = parsed;
      }
    } catch {
      // Storage unavailable. Staying null means the gate shows its loader,
      // which is correct — we genuinely do not know.
    } finally {
      _hydrated = true;
      _inFlight = null;
    }
  })();

  return _inFlight;
}

/**
 * Store the latest live answer. Never throws; a failed write only costs the
 * next cold launch its head start.
 *
 * Deliberately a no-op for an empty map: the server sends `screens` absent on
 * an older API and the resolver can return nothing mid-provisioning, and
 * persisting that would replace a good map with one that hides everything.
 */
export async function persistScreenAccess(
  screens: Record<string, { enabled: boolean }> | undefined,
  launched: Record<string, boolean> | undefined,
): Promise<void> {
  if (!screens || Object.keys(screens).length === 0) return;

  const flat: Record<string, boolean> = {};
  for (const [route, v] of Object.entries(screens)) flat[route] = v.enabled;

  const next: CachedScreenAccess = { screens: flat, launched: launched ?? {}, at: Date.now() };

  // Skip the write when nothing changed — this runs on every five-minute
  // refetch, and AsyncStorage on the JS thread is not free.
  if (_cached && sameMap(_cached.screens, flat) && sameMap(_cached.launched, next.launched)) return;

  _cached = next;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Keep the in-memory copy; it still serves this session.
  }
}

function sameMap(a: Record<string, boolean>, b: Record<string, boolean>): boolean {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  return ak.every((k) => a[k] === b[k]);
}

/** Sign-out clears it — the next person on this device is not this patient. */
export async function clearScreenAccessCache(): Promise<void> {
  _cached = null;
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Nothing to do; the in-memory copy is already gone.
  }
}
