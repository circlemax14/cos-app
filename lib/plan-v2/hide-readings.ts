/**
 * Per-section "Hide readings" persistent toggle (COS-475, Phase 6.4).
 *
 * When ON, task/routine rows suppress the last-reading/measurement line
 * but keep title + scheduled time + provenance chip. Persists per BPS
 * section key so hiding readings on Biological doesn't affect the other
 * two panels.
 *
 * Round 2: storage keys are per-user (`planV2:<userSub>:hideReadings:<section>`)
 * to prevent one patient's preference (which reveals which readings
 * they’ve chosen to hide — a soft PHI signal) from leaking to the next
 * user on the same device. Legacy device-wide keys are migrated on
 * first read for a given userSub and then deleted.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UnifiedSectionKey } from '@/services/api/unified-plan';

/** @deprecated Round 2: kept for the one-shot migration only. */
export const LEGACY_KEY_PREFIX = 'planV2:hideReadings:' as const;

const SECTION_KEYS: UnifiedSectionKey[] = ['biological', 'psychological', 'socialSpiritual'];

function legacyKeyFor(sectionKey: UnifiedSectionKey): string {
  return `${LEGACY_KEY_PREFIX}${sectionKey}`;
}

export function hideReadingsKeyFor(
  userSub: string,
  sectionKey: UnifiedSectionKey,
): string {
  return `planV2:${userSub}:hideReadings:${sectionKey}`;
}

/**
 * One-shot migration: copies legacy device-wide `planV2:hideReadings:*`
 * values into the per-user namespace under `userSub` (only when the
 * per-user key is missing), then deletes the legacy keys. Idempotent
 * after first successful run.
 */
export async function migrateLegacyHideReadingsKeys(userSub: string): Promise<void> {
  if (!userSub) return;
  try {
    const legacyKeys = SECTION_KEYS.map(legacyKeyFor);
    const legacyEntries = await AsyncStorage.multiGet(legacyKeys);
    const hasAnyLegacy = legacyEntries.some(([, v]) => v !== null && v !== undefined);
    if (!hasAnyLegacy) return;

    const perUserKeys = SECTION_KEYS.map((k) => hideReadingsKeyFor(userSub, k));
    const perUserEntries = await AsyncStorage.multiGet(perUserKeys);
    const perUserByKey = new Map(perUserEntries.map(([k, v]) => [k, v] as const));

    const writes: [string, string][] = [];
    legacyEntries.forEach(([legacyKey, legacyVal], i) => {
      void legacyKey;
      const section = SECTION_KEYS[i];
      const perUserKey = hideReadingsKeyFor(userSub, section);
      const existing = perUserByKey.get(perUserKey);
      if (legacyVal != null && (existing == null || existing === '')) {
        writes.push([perUserKey, legacyVal]);
      }
    });
    if (writes.length > 0) {
      await AsyncStorage.multiSet(writes);
    }
    await AsyncStorage.multiRemove(legacyKeys);
  } catch {
    // Best-effort. Fall through to empty-defaults on read.
  }
}

export async function readHideReadings(
  userSub: string,
  sectionKey: UnifiedSectionKey,
): Promise<boolean> {
  if (!userSub) return false;
  const raw = await AsyncStorage.getItem(hideReadingsKeyFor(userSub, sectionKey));
  return raw === '1';
}

export async function writeHideReadings(
  userSub: string,
  sectionKey: UnifiedSectionKey,
  hidden: boolean,
): Promise<void> {
  if (!userSub) return;
  await AsyncStorage.setItem(hideReadingsKeyFor(userSub, sectionKey), hidden ? '1' : '0');
}

export async function readAllHideReadings(
  userSub: string,
): Promise<Record<UnifiedSectionKey, boolean>> {
  const out: Record<UnifiedSectionKey, boolean> = {
    biological: false,
    psychological: false,
    socialSpiritual: false,
  };
  if (!userSub) return out;
  const entries = await AsyncStorage.multiGet(
    SECTION_KEYS.map((k) => hideReadingsKeyFor(userSub, k)),
  );
  entries.forEach(([storageKey, value], i) => {
    void storageKey;
    out[SECTION_KEYS[i]] = value === '1';
  });
  return out;
}
