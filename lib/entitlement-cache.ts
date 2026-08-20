/**
 * COS-727 — the device's last-known entitlements.
 *
 * WHY THIS EXISTS
 * The profile query is memory-only (gcTime 10 min, nothing on disk). So a cold
 * launch with no network has no entitlements at all — which, under the
 * fail-open clinical rule, means every paid feature is free. Force-quit,
 * airplane mode, relaunch. That is fine for clinical gating and fatal for a
 * paywall.
 *
 * This module gives the paid gate something to fall back on, so a subscriber
 * offline keeps what they paid for AND a non-subscriber offline does not
 * suddenly acquire it. See lib/entitlement-decision.ts for the decision table.
 *
 * NOT A SECURITY BOUNDARY. It is AsyncStorage — a determined user can edit it
 * on a rooted device. It exists to make the paywall correct for honest users
 * offline, not to defend against tampering. The server remains the authority:
 * anything that actually costs money (an LLM call, a report generation) must be
 * checked server-side, where the resolver is. A client gate is a UX affordance
 * in both modes; the difference is only whether it degrades open or remembers.
 *
 * Module-scoped rather than a provider: it is read during render by a hook that
 * cannot await, and threading a context through the tree buys nothing when the
 * value is a single array with one writer.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { isPersistableEntitlements } from './entitlement-decision';

const KEY = 'csh-entitlements-last-known';

/** Synchronous view for render. `null` until hydrated, which is the safe state. */
let _cached: readonly string[] | null = null;
let _hydrated = false;
let _inFlight: Promise<void> | null = null;

/** What the paid gate reads. Never throws, never blocks. */
export function readCachedEntitlements(): readonly string[] | null {
  return _cached;
}

export function isEntitlementCacheHydrated(): boolean {
  return _hydrated;
}

/**
 * Load from disk once. Safe to call repeatedly and concurrently — later callers
 * await the first call rather than racing it.
 */
export function hydrateEntitlementCache(): Promise<void> {
  if (_hydrated) return Promise.resolve();
  if (_inFlight) return _inFlight;

  _inFlight = (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        // Re-validate on read. A corrupted or hand-edited value must not become
        // a confident deny — fall through to null, which reads as "unknown".
        if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) {
          if (isPersistableEntitlements(parsed)) _cached = parsed;
        }
      }
    } catch {
      // Storage unavailable. Staying null means the paid gate degrades to open,
      // which is the direction we want to fail in.
    } finally {
      _hydrated = true;
      _inFlight = null;
    }
  })();

  return _inFlight;
}

/**
 * Record a live array as the new last-known state.
 *
 * Only real, non-empty arrays are stored — persisting `[]` would cache a
 * provisioning gap and turn a transient server-side bug into a durable
 * client-side one, denying paid features long after the gap was fixed.
 */
export function persistEntitlements(list: readonly string[] | null | undefined): void {
  if (!isPersistableEntitlements(list)) return;
  // Skip the write when nothing changed — this is called on every profile
  // refetch, which is every five minutes plus every foreground.
  if (_cached && _cached.length === list.length && _cached.every((v, i) => v === list[i])) return;

  _cached = list;
  _hydrated = true;
  void AsyncStorage.setItem(KEY, JSON.stringify(list)).catch(() => {
    // Best-effort. An in-memory value still serves this session.
  });
}

/** Sign-out must not leave the previous account's entitlements behind. */
export async function clearEntitlementCache(): Promise<void> {
  _cached = null;
  _hydrated = true;
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // In-memory clear already happened, which is the part that matters here.
  }
}

/** Test seam — resets module state without touching storage. */
export function __resetEntitlementCacheForTest(): void {
  _cached = null;
  _hydrated = false;
  _inFlight = null;
}
