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

/*
 * COS-898 — the app catalogue now matches the server's.
 *
 * cos-backend/src/services/health-source.service.ts has carried five sources
 * since it was written — apple-health, apple-watch, samsung-health,
 * health-connect, other-wearable — with a note saying the Watch is listed
 * separately "because Vishal wants them listed separately in the UI". The app
 * only ever offered three, so the two rows he asked for never appeared.
 */
export type HealthSourceId =
  | 'apple-health'
  | 'apple-watch'
  | 'samsung-health'
  | 'health-connect'
  | 'other-wearable';

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
  /**
   * COS-898 — the one sentence this row needs that its label cannot say.
   *
   * Apple Watch is the reason this exists. It has NO third-party API: watchOS
   * writes into HealthKit and apps read it from there, so "connect the Watch
   * instead of Apple Health" is not a thing any iOS app can do — it is the
   * same permission. Saying so on the row is the difference between a product
   * that looks broken and one that is telling the truth about the platform.
   */
  note?: string;
}

export const HEALTH_SOURCES: readonly HealthSource[] = [
  {
    id: 'apple-health',
    label: 'Apple Health',
    platform: 'ios',
    aggregates: ['Apple Watch', 'Oura', 'Whoop', 'Garmin', 'Fitbit'],
    requires: { module: 'react-native-health', bundled: true },
    note: 'Everything your iPhone already collects, plus any app or band that writes into Apple Health.',
  },
  {
    /*
     * Same HealthKit permission as apple-health — deliberately. Apple exposes
     * no direct Watch connection to third-party apps, so this row is not a
     * second integration; it is a preference for WHERE the numbers come from.
     * Picking it says "use what the Watch recorded" rather than what the phone
     * counted, which is a real difference in heart rate, workouts and sleep.
     */
    id: 'apple-watch',
    label: 'Apple Watch',
    platform: 'ios',
    aggregates: ['Apple Watch'],
    requires: { module: 'react-native-health', bundled: true },
    note: 'Reads through Apple Health — Apple gives apps no direct Watch connection. Choosing this prefers what the Watch recorded over what the phone counted.',
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
  {
    /*
     * Oura, Whoop, Fitbit and Garmin each have their own cloud API, so they
     * CAN be connected directly, without Apple Health or Health Connect in the
     * middle. That is a real integration per vendor — OAuth, a registered
     * developer account, a redirect URI and a token store — and none of it
     * exists yet. Listed so the answer to "can I connect my Oura?" is on the
     * screen instead of being absent.
     */
    id: 'other-wearable',
    label: 'Other wearable',
    platform: 'both',
    aggregates: ['Oura', 'Whoop', 'Fitbit', 'Garmin'],
    requires: { module: 'direct-vendor-oauth', bundled: false },
    note: 'Connect an Oura, Whoop, Fitbit or Garmin account directly. Not available yet — each one needs its own account link.',
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
 *
 * COS-897 removed 'wrong-platform' and 'wrong-device'. They existed to render
 * a source this device can never use as a row with an excuse; a source this
 * device can never use is not shown at all now, so nothing can carry them.
 * Only `connectable` gets a working control.
 */
export type HealthSourceStatus = 'connectable' | 'needs-native-build';

export interface HealthSourceOffer {
  source: HealthSource;
  status: HealthSourceStatus;
  /** User-facing, written to be rendered verbatim. Contains no health data. */
  note: string;
}

/**
 * The sources that belong on THIS device — each with the reason it can or
 * cannot be used right now.
 *
 * ─── COS-897: THIS FILTERS AGAIN, AND THAT WAS THE RIGHT ANSWER ──────
 *
 * COS-892 removed the filter and listed all three on every device. That
 * over-read the instruction. Vishal on seeing the result: "why am I able to
 * see Apple Health, Samsung, and Health Connect on my iPhone?" — and he is
 * right: Samsung Health on an iPhone is not an option the patient can act on,
 * ever, on any build. It is noise in a list of two real choices.
 *
 * What he actually asked for is preserved, and it is the narrower rule: a
 * source that BELONGS on this device but is not in this binary stays visible
 * with its reason, instead of vanishing. That was already this file's
 * behaviour and it is what `needs-native-build` is for. A Galaxy owner still
 * sees Samsung Health and reads why it is off; an iPhone owner is not offered
 * a phone they do not have.
 *
 * The distinction worth keeping: HIDE what this device could never use, SHOW
 * with a reason what it could use but cannot yet.
 *
 * Pure — callers pass `Platform.OS` and `deviceManufacturer()` in, so this is
 * testable without a device.
 */
export function availability(
  os: string,
  manufacturer?: string | null,
): HealthSourceOffer[] {
  const brand = (manufacturer ?? '').trim().toLowerCase();

  return HEALTH_SOURCES.filter((source) => {
    // Platform gate FIRST. This is what keeps Apple Health off Android and
    // Samsung Health off an iPhone — neither can ever be acted on there, so
    // neither is a choice.
    if (source.platform !== 'both' && source.platform !== os) return false;
    // Manufacturer gate: Samsung Health only on a Samsung handset. Substring,
    // because the constant reads "samsung" on most and "Samsung Electronics"
    // on some.
    if (source.requiresManufacturer && !brand.includes(source.requiresManufacturer)) {
      return false;
    }
    return true;
  }).map((source) => {
    if (!source.requires.bundled) {
      return {
        source,
        status: 'needs-native-build' as const,
        note:
          source.note ??
          `${source.label} isn't in this version of the app. It needs an app update from the store — it can't be switched on from here.`,
      };
    }

    return {
      source,
      status: 'connectable' as const,
      note:
        source.note ??
        `Includes ${source.aggregates.slice(0, 3).join(', ')} and other devices that sync to ${source.label}.`,
    };
  });
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
    // COS-898 — one case, two rows. The Watch writes into HealthKit, so there
    // is exactly one permission to ask for and asking twice would prompt the
    // patient twice for the same thing.
    case 'apple-health':
    case 'apple-watch': {
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
/**
 * COS-898 — sources that read through the SAME underlying permission.
 *
 * apple-health and apple-watch are one HealthKit grant wearing two labels.
 * Switching between them must not run the teardown: setAppleHealthEnabled(false)
 * is the data-path switch that lib/apple-health-gate.ts and useHealthKitTrends
 * both read, so tearing down the outgoing row would turn off the very path the
 * incoming row needs — the patient would pick Apple Watch and receive nothing.
 */
const HEALTHKIT_SOURCES: readonly HealthSourceId[] = ['apple-health', 'apple-watch'];

function sharesDataPath(a: HealthSourceId, b: HealthSourceId): boolean {
  return HEALTHKIT_SOURCES.includes(a) && HEALTHKIT_SOURCES.includes(b);
}

async function runDisconnect(id: HealthSourceId): Promise<void> {
  if (HEALTHKIT_SOURCES.includes(id)) {
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

  /*
   * COS-892 — the platform rule is enforced HERE, not only in the screen.
   *
   * Now that every source is listed on every device, `findHealthSource` will
   * happily return Apple Health on a Pixel. The screen does not offer a
   * control for a non-connectable row, but the screen is not the guard: this
   * function is the one path every connect goes through, and the rule belongs
   * where it cannot be skipped by a future caller or a deep link.
   */
  const offer = availableHealthSources().find((o) => o.source.id === source.id);
  if (!offer || offer.status !== 'connectable') {
    return { ok: false, message: offer?.note ?? 'That health source is not available.' };
  }

  try {
    const granted = await runConnect(source);
    if (!granted) {
      return { ok: false, message: `${source.label} access was not granted.` };
    }

    const previous = await getConnectedHealthSource();
    const replaced = previous && previous.id !== source.id ? previous.id : null;
    // Only tear the old one down when it does not share a permission with the
    // new one — see sharesDataPath.
    if (replaced && !sharesDataPath(replaced, source.id)) await runDisconnect(replaced);
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
