/**
 * COS-930 — name the health app the patient actually has.
 *
 * Vishal, testing on a Galaxy S26: "Right now what you're showing me, you're
 * showing me enable Apple Health [on an] Android device."
 *
 * He was right. COS-929 wired Health Connect underneath but left six
 * user-visible strings hard-coded to Apple's brand, including the main switch
 * label and its accessibility label. A patient on a Samsung was being offered
 * "Enable Apple Health".
 *
 * ─── WHAT THE PATIENT SEES vs WHAT WE READ ───────────────────────────
 *
 * These are two different questions and conflating them is what produced the
 * bug. There are only ever TWO APIs — HealthKit on iOS, Health Connect on
 * Android — but there are many BRANDS, and the brand is what someone
 * recognises on their own phone.
 *
 * On iOS we already do this correctly and have always done: the screen says
 * "Apple Health", and Apple Watch data arrives because the Watch writes INTO
 * HealthKit. We never say "HealthKit" to a patient.
 *
 * Android is the same relationship with different names. Samsung Health,
 * Fitbit, Google Fit and Galaxy Watch all write INTO Health Connect. So on a
 * Samsung the honest label is "Samsung Health" — that IS where their data
 * lives and what they would go and open — while the API we read is Health
 * Connect.
 *
 * ─── WHY `via` EXISTS AND IS NOT OPTIONAL POLISH ─────────────────────
 *
 * A patient can have Samsung Health installed and full of data and STILL see
 * nothing, because Samsung Health syncs to Health Connect only once they turn
 * that on inside Samsung Health. A button that says "Enable Samsung Health"
 * and then shows an empty screen is a bug report. Saying "read through Android
 * Health Connect" is the one sentence that makes that recoverable — it tells
 * them where to look.
 *
 * So the label is the brand, and `via` is the mechanism, and the screen shows
 * both. On iOS `via` is null because HealthKit is not a thing patients have
 * to enable separately.
 *
 * ─── ONLY SAMSUNG IS NAMED, DELIBERATELY ─────────────────────────────
 *
 * Xiaomi, Huawei, OnePlus and others each have their own health app, and
 * naming them means a table that is wrong for whichever device we did not
 * think of — a Pixel user told to "Enable Samsung Health" is worse than a
 * generic label. Samsung is named because it is the device in front of us and
 * roughly a third of Android; everything else gets "Health", which is accurate
 * everywhere and wrong nowhere. Vishal: "some other Android device, and
 * whatever the health permission feature that they have, so we just show them
 * enable health."
 *
 * PURE — no React, no react-native import. Callers pass the already-resolved
 * platform and manufacturer, which keeps this unit-testable under `node --test`
 * and mirrors lib/apple-health-gate.ts's shape.
 */

/** The API actually read. Two, ever. */
export type HealthApi = 'healthkit' | 'health-connect' | 'none';

export interface HealthSourceIdentity {
  /** Which API the code talks to. */
  api: HealthApi;
  /**
   * The brand on the patient's device. Goes in button labels and headings —
   * "Apple Health", "Samsung Health", "Health".
   */
  label: string;
  /**
   * How that brand's data reaches us, when it needs saying. Null on iOS.
   * Rendered as supporting copy under the switch, never as the label.
   */
  via: string | null;
  /** True when the label is a real product name rather than the generic word. */
  isBrandedLabel: boolean;
}

const NONE: HealthSourceIdentity = {
  api: 'none',
  label: 'Health',
  via: null,
  isBrandedLabel: false,
};

/**
 * Resolve what to show and what to read.
 *
 * @param platformOs   Platform.OS
 * @param manufacturer Platform.constants.Manufacturer on Android; ignored
 *                     elsewhere. Case and spacing vary by OEM, so it is
 *                     normalised here rather than at every call site.
 */
export function resolveHealthSourceIdentity(
  platformOs: string,
  manufacturer?: string | null,
): HealthSourceIdentity {
  if (platformOs === 'ios') {
    return {
      api: 'healthkit',
      label: 'Apple Health',
      // HealthKit is not something a patient enables separately, and naming it
      // would be introducing a word they have never seen.
      via: null,
      isBrandedLabel: true,
    };
  }

  if (platformOs !== 'android') return NONE;

  const make = (manufacturer ?? '').trim().toLowerCase();

  if (make === 'samsung') {
    return {
      api: 'health-connect',
      label: 'Samsung Health',
      // The sentence that turns an empty screen into a fixable one.
      via: 'Read through Android Health Connect. Make sure Samsung Health is set to sync with Health Connect.',
      isBrandedLabel: true,
    };
  }

  return {
    api: 'health-connect',
    label: 'Health',
    via: 'Read through Android Health Connect, which your health and fitness apps write into.',
    isBrandedLabel: false,
  };
}
