/**
 * Health Sync — the catalogue of health data sources, and the rules for which
 * ones may be OFFERED and which one is CONNECTED.
 *
 * Extends the single Apple Health toggle (COS-389 / SCRUM-530) into a
 * multi-source picker. Two rules are structural here, not conventions someone
 * has to remember:
 *
 *  1. APPLE HEALTH IS NEVER OFFERED ON ANDROID. `availability()` filters on
 *     `platform` before anything else, and that filter is the only path to an
 *     offered row — there is no second code path that could leak it through.
 *
 *  2. EXACTLY ONE SOURCE IS CONNECTED. The connection is ONE stored value
 *     (`ConnectedHealthSource | null`), not a set, not a per-source boolean.
 *     "Only one at a time" is a property of the storage SHAPE — there is no
 *     list that could grow a second entry, so no caller can forget to enforce
 *     it. `connectHealthSource()` disconnects the incumbent in the same call.
 *
 * ── What can actually connect in this build ───────────────────────────────
 * `react-native-health` (HealthKit) is the ONLY health native module in
 * package.json. Samsung Health and Health Connect are native SDKs: adding one
 * needs a new binary (Xcode archive / Gradle build) and CANNOT ship over OTA.
 * So they carry `requires.bundled: false` and resolve to `available: false`
 * with an `unavailableReason` — listed honestly as "not in this version"
 * rather than rendered as a control that silently does nothing. When an SDK is
 * added later, flip `bundled` and fill in its case in `runConnect()`; every
 * caller and the entire screen stay unchanged.
 *
 * ── Apple Watch and other wearables ───────────────────────────────────────
 * Apple Watch is NOT a separate source. It has no SDK of its own — its data
 * arrives through HealthKit, and so does Oura's, Whoop's, Garmin's and
 * Fitbit's. A separate row would mean "connecting Apple Watch" disconnects
 * Apple Health while reading the exact same pipe. Instead each source lists
 * the devices it brings with it (`aggregates`, surfaced as `description`), so
 * the screen can say "Apple Health — includes Apple Watch and other wearables"
 * truthfully. On Android, Health Connect plays that same aggregator role: it
 * is the "connect any other wearable" answer there, once it is in the binary.
 *
 * Keep the top half of this file PURE (catalogue + `availability()` + copy
 * helpers): no React, no storage, no native calls, trivially testable.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import {
  getAppleHealthEnabled,
  setAppleHealthEnabled,
} from '@/services/apple-health-preference';
import { initializeHealthKit } from '@/services/health';

// ─── Catalogue ───────────────────────────────────────────────────────────────

export type HealthSourceId = 'apple-health' | 'samsung-health' | 'health-connect';

export interface HealthSource {
  id: HealthSourceId;
  /** Row title. */
  label: string;
  /** Which platform may offer it. `availability()` enforces this. */
  platform: 'ios' | 'android' | 'both';
  /**
   * Devices whose data arrives THROUGH this source. Display only — they are
   * deliberately not separately connectable (see the header note on Apple
   * Watch), which is the whole reason for listing them here.
   */
  aggregates: readonly string[];
  /** The native module this source needs compiled into the binary. */
  requires: {
    /** npm package name. */
    module: string;
    /** Whether that module actually ships in THIS build. */
    bundled: boolean;
  };
  /**
   * Only offer on devices from this manufacturer (case-insensitive substring
   * of `Platform.constants.Manufacturer`). Samsung Health is the only
   * device-locked source: it must not appear on a Pixel or a OnePlus.
   */
  requiresManufacturer?: string;
}

export const HEALTH_SOURCES: readonly HealthSource[] = [
  {
    id: 'apple-health',
    label: 'Apple Health',
    platform: 'ios',
    aggregates: ['Apple Watch', 'Oura', 'Whoop', 'Garmin', 'Fitbit'],
    requires: { module: 'react-native-health', bundled: true },
  },
  {
    id: 'samsung-health',
    label: 'Samsung Health',
    platform: 'android',
    aggregates: ['Galaxy Watch', 'Galaxy Ring'],
    // ponytail: no SDK in package.json, and adding one needs a new binary.
    // When it lands: flip `bundled` and add the case in runConnect().
    requires: { module: '@samsung/samsung-health-data', bundled: false },
    requiresManufacturer: 'samsung',
  },
  {
    id: 'health-connect',
    label: 'Health Connect',
    platform: 'android',
    aggregates: ['Fitbit', 'Garmin', 'Oura', 'Whoop', 'Wear OS watches'],
    // ponytail: same — Android's aggregator, i.e. how "connect any other
    // wearable" gets answered on Android once the module is in the binary.
    requires: { module: 'react-native-health-connect', bundled: false },
  },
];

export function findHealthSource(id: string): HealthSource | null {
  return HEALTH_SOURCES.find((s) => s.id === id) ?? null;
}

export function healthSourceLabel(id: string): string {
  return findHealthSource(id)?.label ?? id;
}

// ─── Availability ────────────────────────────────────────────────────────────

/**
 * `connectable`        — may be offered AND can be connected right now.
 * `needs-native-build` — belongs on this device, but its native module is not
 *                        in this build. Render it with `note` as the reason
 *                        and NO control; never a switch that does nothing.
 */
export type HealthSourceStatus = 'connectable' | 'needs-native-build';

export interface HealthSourceOffer {
  source: HealthSource;
  status: HealthSourceStatus;
  /** User-facing, written to be rendered verbatim. Contains no health data. */
  note: string;
}

/**
 * Which sources may be OFFERED, given the platform and the device
 * manufacturer. Pure — callers pass `Platform.OS` and `deviceManufacturer()`
 * in, so this is testable without a device.
 *
 * A source that does not belong on this device (Apple Health on Android,
 * Samsung Health on a Pixel) is not returned in any form. A source that
 * belongs but has no native module IS returned as `needs-native-build` — the
 * user should know it exists and why it is off.
 */
export function availability(
  os: string,
  manufacturer?: string | null,
): HealthSourceOffer[] {
  const brand = (manufacturer ?? '').trim().toLowerCase();

  return HEALTH_SOURCES.filter((source) => {
    // Platform gate FIRST. This is what keeps Apple Health off Android.
    if (source.platform !== 'both' && source.platform !== os) return false;
    // Manufacturer gate: Samsung Health only on a Samsung device. Substring,
    // because the constant reads "samsung" on most handsets and "Samsung
    // Electronics" on some.
    if (source.requiresManufacturer && !brand.includes(source.requiresManufacturer)) {
      return false;
    }
    return true;
  }).map((source) => ({
    source,
    status: source.requires.bundled
      ? ('connectable' as const)
      : ('needs-native-build' as const),
    note: source.requires.bundled
      ? `Includes ${source.aggregates.slice(0, 3).join(', ')} and other devices that sync to ${source.label}.`
      : `${source.label} isn't in this version of the app. It needs an app update from the store — it can't be switched on from here.`,
  }));
}

/**
 * Android manufacturer, null on any other platform.
 *
 * `react-native-device-info` and `expo-device` are NOT dependencies (checked
 * package.json, 2026-09-04) and we are not adding one for a single string —
 * React Native already publishes it on `Platform.constants`.
 */
export function deviceManufacturer(): string | null {
  if (Platform.OS !== 'android') return null;
  return Platform.constants.Manufacturer || Platform.constants.Brand || null;
}

/** `availability()` for the device this code is running on. */
export function availableHealthSources(): HealthSourceOffer[] {
  return availability(Platform.OS, deviceManufacturer());
}

// ─── The single connection ───────────────────────────────────────────────────

/**
 * ONE value. Not an array, not a set, not a map of booleans — there is no
 * shape here that can hold two connected sources.
 */
export interface ConnectedHealthSource {
  id: HealthSourceId;
  /** ISO timestamp, for "Connected on …" copy. */
  connectedAt: string;
}

const STORAGE_KEY = 'cos_health_source_v1';

/**
 * The connected source, or null. Survives restart (AsyncStorage). An id no
 * longer in the catalogue reads as null, so a build that drops a source can't
 * resurrect a stale connection.
 *
 * Falls back to the legacy COS-389 boolean, so a user who already had Apple
 * Health on doesn't come back as "nothing connected" while their data path is
 * still live. Read-only fallback — the first connect/disconnect writes the new
 * value and takes over.
 */
export async function getConnectedHealthSource(): Promise<ConnectedHealthSource | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return legacyAppleHealthConnection();
    const parsed = JSON.parse(raw) as Partial<ConnectedHealthSource>;
    if (!parsed?.id || !findHealthSource(parsed.id)) return null;
    return { id: parsed.id, connectedAt: parsed.connectedAt ?? new Date().toISOString() };
  } catch {
    return null;
  }
}

async function legacyAppleHealthConnection(): Promise<ConnectedHealthSource | null> {
  if (Platform.OS !== 'ios') return null;
  const enabled = await getAppleHealthEnabled();
  return enabled ? { id: 'apple-health', connectedAt: new Date().toISOString() } : null;
}

async function writeConnectedHealthSource(next: ConnectedHealthSource | null): Promise<void> {
  try {
    if (next) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Non-fatal: in-memory state still reflects the choice for this session,
    // and the next launch falls back to the stored (older) value.
  }
}

/**
 * What connecting `nextId` is about to replace, as a sentence — null when
 * nothing is being replaced. Callers show this BEFORE calling `connect`, so a
 * user is never silently switched off the source they picked.
 */
export function describeReplacement(
  current: ConnectedHealthSource | null,
  nextId: string,
): string | null {
  if (!current || current.id === nextId) return null;
  return `Connecting ${healthSourceLabel(nextId)} will disconnect ${healthSourceLabel(
    current.id,
  )}. Only one source can be connected at a time — we read data from that one.`;
}

// ─── Connect / disconnect ────────────────────────────────────────────────────

export interface HealthSourceResult {
  ok: boolean;
  /** User-facing. Safe to render verbatim; contains no health data. */
  message: string;
}

/**
 * Per-source connect handshake. Returns false when the user declined.
 * Throws when the source cannot be connected in this build at all.
 */
async function runConnect(source: HealthSource): Promise<boolean> {
  if (!source.requires.bundled) {
    throw new Error(
      `${source.label} isn't in this version of the app. It needs an app update from the store.`,
    );
  }

  switch (source.id) {
    case 'apple-health': {
      const granted = await initializeHealthKit();
      // Keep the legacy boolean in step — lib/apple-health-gate.ts and
      // useHealthKitTrends still read it as the data-path switch.
      await setAppleHealthEnabled(granted);
      return granted;
    }
    default:
      // Unreachable: every bundled source has a case above. A new SDK adds its
      // case here and nothing else in the app changes.
      throw new Error(`${source.label} can't be connected from this build.`);
  }
}

/** Per-source teardown. Best-effort; must never block a switch. */
async function runDisconnect(id: HealthSourceId): Promise<void> {
  if (id === 'apple-health') {
    // iOS does not let an app revoke its own HealthKit read access — that
    // lives in Settings > Privacy & Security > Health. Dropping the local
    // preference is the honest maximum, and it does stop the data path.
    await setAppleHealthEnabled(false);
  }
}

/**
 * Connect `id`, replacing whatever is connected now.
 *
 * Order matters: the new handshake runs FIRST. If the user declines it or it
 * fails, the existing connection is left untouched rather than the user ending
 * up with nothing connected. Only on success is the incumbent explicitly
 * disconnected and the single stored value overwritten.
 *
 * Never throws — returns `{ ok, message }`, so a screen can render the outcome
 * without a try/catch and a failure is never silent.
 */
export async function connectHealthSource(id: string): Promise<HealthSourceResult> {
  const source = findHealthSource(id);
  if (!source) return { ok: false, message: 'That health source is not available.' };

  try {
    const granted = await runConnect(source);
    if (!granted) {
      return { ok: false, message: `${source.label} access was not granted.` };
    }

    const previous = await getConnectedHealthSource();
    const replaced = previous && previous.id !== source.id ? previous.id : null;
    if (replaced) await runDisconnect(replaced);
    await writeConnectedHealthSource({ id: source.id, connectedAt: new Date().toISOString() });

    return {
      ok: true,
      message: replaced
        ? `${source.label} connected. ${healthSourceLabel(replaced)} was disconnected.`
        : `${source.label} connected. Your daily summary will use ${source.label} data.`,
    };
  } catch (error) {
    // No PHI — a source id and a connection error.
    console.warn('[health-sources] connect failed', id, error);
    return {
      ok: false,
      message: error instanceof Error ? error.message : `Could not connect ${source.label}.`,
    };
  }
}

/** Disconnect whatever is connected. No-op (and still `ok`) when nothing is. */
export async function disconnectHealthSource(): Promise<HealthSourceResult> {
  const current = await getConnectedHealthSource();
  if (!current) return { ok: true, message: 'No health source is connected.' };

  await runDisconnect(current.id);
  await writeConnectedHealthSource(null);

  const label = healthSourceLabel(current.id);
  return {
    ok: true,
    message: current.id === 'apple-health'
      ? `${label} turned off. To fully revoke access, open Settings > Privacy & Security > Health.`
      : `${label} disconnected.`,
  };
}
