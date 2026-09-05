/**
 * COS-901 — take the patient to the Health permission page, not to a generic
 * app settings screen.
 *
 * ─── WHAT WENT MISSING ───────────────────────────────────────────────
 *
 * The app used to do this. `openHealthSettings` lived in the Today's Schedule
 * Health Metrics block and opened `App-Prefs:root=Privacy&path=HEALTH`, which
 * lands on Settings > Privacy & Security > Health. It was deleted in build 45
 * (935df34) as collateral when that whole block was pulled — Ken: "we already
 * have it in Health Trends" — not for any App Store or platform reason. So
 * nothing was decided against it; it simply went out with the furniture.
 *
 * Vishal, on the replacement: "when I click on the open settings, it is taking
 * me to the settings screen where I have options like allow CSH to access
 * Reminders, Photos, Siri, Calendar, Background App Refresh and Cellular
 * Data. It doesn't have this Apple Health. That URL was different."
 *
 * He is right. `Linking.openSettings()` opens THIS APP's page, and HealthKit
 * permissions are deliberately not listed there — they live under Privacy,
 * because Apple treats health data differently from every other permission.
 *
 * ─── A LADDER, NOT A URL ─────────────────────────────────────────────
 *
 * `App-Prefs:` is an undocumented scheme. It has worked for years, Apple has
 * never published it, and it has been narrowed in successive iOS releases —
 * so it is tried FIRST and trusted LAST. Each rung is strictly worse than the
 * one above and strictly better than nothing:
 *
 *   1. Settings > Privacy & Security > Health   — exactly where they need to be
 *   2. the Health app itself                    — Sharing > Apps is two taps in
 *   3. this app's own Settings page             — at least it is Settings
 *
 * `openURL` rather than `canOpenURL`, deliberately. canOpenURL on iOS returns
 * false for any scheme not declared in LSApplicationQueriesSchemes, and
 * declaring one needs a new binary — so the guarded version would have failed
 * every rung over an OTA and silently landed on rung 3, which is the bug being
 * fixed. openURL just rejects, and a rejection is what moves us down the
 * ladder.
 *
 * ⚠️ APP STORE: an undocumented scheme is a review risk. It is not a private
 * API call and there is no entitlement involved, and the ladder means a
 * blocked scheme degrades rather than breaks — but if review ever objects,
 * delete rung 1 and rung 2 keeps most of the value.
 */

import { Linking, Platform } from 'react-native';

/** Settings › Privacy & Security › Health. Undocumented; see the header. */
const IOS_HEALTH_PRIVACY = 'App-Prefs:root=Privacy&path=HEALTH';
/** The Health app. Sharing › Apps › CSH is two taps from here. */
const IOS_HEALTH_APP = 'x-apple-health://';
/** Android's Health Connect permission screen. */
const ANDROID_HEALTH_CONNECT = 'android.health.connect.action.HEALTH_HOME_SETTINGS';

/** Where the caller actually ended up, so the screen can say something true. */
export type HealthSettingsTarget = 'health-privacy' | 'health-app' | 'app-settings' | 'failed';

async function tryOpen(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Open the closest thing to the Health permission page this device allows.
 *
 * Never throws — it reports which rung it reached, and 'failed' is a real
 * outcome the caller has to handle rather than an exception to swallow.
 */
export async function openHealthSettings(): Promise<HealthSettingsTarget> {
  if (Platform.OS === 'ios') {
    if (await tryOpen(IOS_HEALTH_PRIVACY)) return 'health-privacy';
    if (await tryOpen(IOS_HEALTH_APP)) return 'health-app';
  } else if (Platform.OS === 'android') {
    if (await tryOpen(ANDROID_HEALTH_CONNECT)) return 'health-privacy';
  }

  try {
    await Linking.openSettings();
    return 'app-settings';
  } catch {
    return 'failed';
  }
}

/**
 * What to tell the patient once they are back, given where they landed.
 *
 * Rung 1 needs no instructions — they are looking at the list. The lower rungs
 * do, and saying nothing there is how someone ends up on the wrong screen
 * deciding the app is broken.
 */
export function healthSettingsFollowUp(target: HealthSettingsTarget): string | null {
  switch (target) {
    case 'health-privacy':
      return null;
    case 'health-app':
      return 'Opened the Health app — the app permissions are under Sharing, then Apps.';
    case 'app-settings':
      return 'Opened Settings. Health permissions are not on this page — go back to the top level, then Privacy & Security > Health.';
    case 'failed':
      return 'Could not open Settings. Open it from your home screen, then Privacy & Security > Health.';
  }
}
