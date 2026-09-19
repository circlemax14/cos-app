/**
 * COS-1045 — what we are tracking, and where it came from.
 *
 * Ken 2026-09-18, on the Home "Health Trends" button: he wanted the coloured
 * source segments from the Trends screen brought onto it — "how many things we
 * are tracking and in different colours your check-ins and from your device" —
 * so the button says something instead of being a row link.
 *
 * ─── BUILDER ONLY — THE BAR ITSELF ALREADY EXISTS ────────────────────
 *
 * components/health-summary/TrendSourceBar renders these segments and has
 * since COS-967. This module does NOT re-implement it; it builds the array
 * that component takes, so Home and the Trends screen can show the same bar
 * from the same definition.
 *
 * ─── WHY THIS IS A SHARED MODULE AND NOT A SECOND COPY ───────────────
 *
 * The definition lived inline in app/Home/health-trends.tsx. Putting the same
 * three labels and colours on Home by copying them would guarantee they drift:
 * the next person to rename "From your devices" or change a colour would find
 * one of the two, and a patient would see the same data described two ways on
 * two screens. So both screens now build from here.
 *
 * ─── THE LABELS ARE LOAD-BEARING ─────────────────────────────────────
 *
 * "From your devices", NOT "Apple Health". On Android the same data comes from
 * Health Connect, and services/health-connect.ts mislabels its own rows
 * `source: 'apple-health'` — the wrong label in the right bucket. "Your
 * devices" is true on both platforms and survives that bug.
 *
 * ─── A SEGMENT IS DRAWN ONLY WHEN ITS PRODUCER RETURNED ROWS ─────────
 *
 * Zero-count segments are dropped, not drawn at width zero or as a grey stub.
 * The clinic bucket is empty on every stage today, so most accounts show two
 * segments — that is the honest picture, not a rendering bug. A bar that
 * always shows three colours would imply we are tracking something we are not.
 */

/**
 * Structurally the same as TrendSource in
 * components/health-summary/TrendSourceBar, deliberately — this builds what
 * that component renders. Narrower `key` so a typo is a compile error.
 */
export interface TrendSource {
  key: 'clinic' | 'checkins' | 'devices';
  label: string;
  count: number;
  color: string;
}

export interface TrendSourceCounts {
  /** Distinct clinic-sourced trends (FHIR + report-derived). */
  clinic: number;
  /** Distinct instruments the patient has answered. */
  checkins: number;
  /** Distinct device-sourced trends (HealthKit / Health Connect). */
  devices: number;
}

/**
 * Build the segments, in a fixed order, dropping any with no rows.
 *
 * Order is deliberate and NOT by size: clinic, then check-ins, then devices —
 * roughly most to least clinically authoritative. A bar that reorders itself
 * as counts change reads as a different bar each time it is seen.
 */
export function buildTrendSources(counts: TrendSourceCounts): TrendSource[] {
  const n = (v: number) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  return [
    { key: 'clinic' as const, label: 'From your clinic', count: n(counts.clinic), color: '#0EA5E9' },
    { key: 'checkins' as const, label: 'Your check-ins', count: n(counts.checkins), color: '#8B5CF6' },
    { key: 'devices' as const, label: 'From your devices', count: n(counts.devices), color: '#10B981' },
  ].filter((s) => s.count > 0);
}

/** Total tracked measures across every source. */
export function totalTracked(sources: readonly TrendSource[]): number {
  return sources.reduce((acc, s) => acc + s.count, 0);
}
