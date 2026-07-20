/**
 * AsyncStorage-backed dismissal + snooze state for AI suggestion chips
 * (COS-475, Phase 6.4).
 *
 * Two independent maps, keyed by suggestion id:
 *   - Dismissed: Record<id, dismissedAtMs> — 7-day TTL, then re-emitted.
 *   - Snoozed: Record<id, snoozeUntilMs> — caller-supplied duration.
 *
 * Storage keys are per-user (Round 2 audit): `planV2:<userSub>:...`.
 * On first read for a given `userSub`, the legacy device-wide keys
 * (`planV2:suggestion:dismissed` / `planV2:suggestion:snoozed`) are
 * migrated into the per-user namespace and deleted, so the incumbent
 * user does not lose their state and no future user inherits it.
 *
 * Pure `isDismissed` helper is stateless so the same rule can be used
 * in node --test unit tests without touching AsyncStorage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/** @deprecated Round 2: kept for the one-shot migration only. */
export const LEGACY_DISMISSED_KEY = 'planV2:suggestion:dismissed' as const;
/** @deprecated Round 2: kept for the one-shot migration only. */
export const LEGACY_SNOOZED_KEY = 'planV2:suggestion:snoozed' as const;

export const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type DismissedMap = Record<string, number>;
export type SnoozedMap = Record<string, number>;

/**
 * True when the suggestion id is currently hidden — either dismissed
 * within the 7d TTL or actively snoozed. Defensive against non-numeric
 * storage values.
 */
export function isDismissed(
  id: string,
  now: number,
  dismissed: DismissedMap | null | undefined,
  snoozed: SnoozedMap | null | undefined,
  ttlMs: number = DISMISS_TTL_MS,
): boolean {
  if (dismissed) {
    const raw = dismissed[id];
    if (typeof raw === 'number' && raw > 0 && now - raw < ttlMs) return true;
  }
  if (snoozed) {
    const until = snoozed[id];
    if (typeof until === 'number' && until > now) return true;
  }
  return false;
}

/** Build the per-user AsyncStorage key for the dismissed map. */
export function dismissedKeyFor(userSub: string): string {
  return `planV2:${userSub}:suggestion:dismissed`;
}

/** Build the per-user AsyncStorage key for the snoozed map. */
export function snoozedKeyFor(userSub: string): string {
  return `planV2:${userSub}:suggestion:snoozed`;
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as T) : null;
  } catch {
    return null;
  }
}

/**
 * One-shot migration from the pre-round-2 device-wide keys into the
 * `planV2:<userSub>:...` namespace. Idempotent: after the legacy keys
 * are removed subsequent calls are cheap no-ops. Only invoked on first
 * read for a given userSub in a session.
 *
 * Merge policy: legacy wins ONLY if per-user key is empty/missing.
 * Otherwise per-user state is preserved untouched — we never overwrite
 * newer per-user writes with stale device-wide state.
 */
export async function migrateLegacySuggestionKeys(userSub: string): Promise<void> {
  if (!userSub) return;
  try {
    const legacyEntries = await AsyncStorage.multiGet([
      LEGACY_DISMISSED_KEY,
      LEGACY_SNOOZED_KEY,
    ]);
    const legacyDismissed = legacyEntries.find(([k]) => k === LEGACY_DISMISSED_KEY)?.[1] ?? null;
    const legacySnoozed = legacyEntries.find(([k]) => k === LEGACY_SNOOZED_KEY)?.[1] ?? null;
    if (!legacyDismissed && !legacySnoozed) return;

    const perUser = await AsyncStorage.multiGet([
      dismissedKeyFor(userSub),
      snoozedKeyFor(userSub),
    ]);
    const perUserDismissed = perUser.find(([k]) => k === dismissedKeyFor(userSub))?.[1] ?? null;
    const perUserSnoozed = perUser.find(([k]) => k === snoozedKeyFor(userSub))?.[1] ?? null;

    const writes: [string, string][] = [];
    if (legacyDismissed && !perUserDismissed) {
      writes.push([dismissedKeyFor(userSub), legacyDismissed]);
    }
    if (legacySnoozed && !perUserSnoozed) {
      writes.push([snoozedKeyFor(userSub), legacySnoozed]);
    }
    if (writes.length > 0) {
      await AsyncStorage.multiSet(writes);
    }
    await AsyncStorage.multiRemove([LEGACY_DISMISSED_KEY, LEGACY_SNOOZED_KEY]);
  } catch {
    // Best-effort. A migration failure must not block the user — the
    // next read falls back to an empty map.
  }
}

export async function readDismissed(userSub: string): Promise<DismissedMap> {
  if (!userSub) return {};
  const raw = await AsyncStorage.getItem(dismissedKeyFor(userSub));
  return safeParse<DismissedMap>(raw) ?? {};
}

export async function readSnoozed(userSub: string): Promise<SnoozedMap> {
  if (!userSub) return {};
  const raw = await AsyncStorage.getItem(snoozedKeyFor(userSub));
  return safeParse<SnoozedMap>(raw) ?? {};
}

export async function dismissSuggestion(
  userSub: string,
  id: string,
  now: number = Date.now(),
): Promise<void> {
  if (!userSub) return;
  const map = await readDismissed(userSub);
  map[id] = now;
  await AsyncStorage.setItem(dismissedKeyFor(userSub), JSON.stringify(map));
}

export async function snoozeSuggestion(
  userSub: string,
  id: string,
  hours: number,
  now: number = Date.now(),
): Promise<void> {
  if (!userSub) return;
  const map = await readSnoozed(userSub);
  map[id] = now + Math.max(0, hours) * 60 * 60 * 1000;
  await AsyncStorage.setItem(snoozedKeyFor(userSub), JSON.stringify(map));
}
