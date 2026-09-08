/**
 * COS-929 — the AndroidManifest Health Connect requires.
 *
 * Three things, none of which app.json can express, and all of which
 * `expo prebuild` would otherwise drop:
 *
 *  1. The `android.permission.health.READ_*` permissions. These are NOT normal
 *     Android permissions — Health Connect reads the manifest to decide what
 *     it is even willing to show the patient a prompt for. A permission
 *     missing here means requestPermission() silently returns nothing granted,
 *     with no error.
 *
 *  2. An intent-filter for ACTION_SHOW_PERMISSIONS_RATIONALE. Health Connect
 *     puts a "read the app's privacy policy" link on its own permission
 *     screen, and Google Play REQUIRES the app to handle that intent for any
 *     app requesting health permissions. Without it the listing is rejected —
 *     and on device the link dead-ends.
 *
 *  3. The `<queries>` entry for com.google.android.apps.healthdata, so
 *     Android 11+ package visibility does not hide Health Connect from us.
 *     react-native-health-connect's own manifest already contributes this, so
 *     it is NOT re-declared here — duplicating it is harmless but implies we
 *     own it, and the next person would have two places to keep in sync.
 *
 * ─── READ-ONLY, AND ONLY WHAT WE READ ────────────────────────────────
 *
 * Every permission listed is shown to the patient verbatim by Health Connect,
 * on a screen where each is a separate decision. Asking for anything we do not
 * actually read costs trust and costs a data-safety declaration, so this list
 * must stay equal to HEALTH_CONNECT_READ_PERMISSIONS in
 * services/health-connect.ts. A test asserts that.
 *
 * No WRITE permissions. This app reads a patient's wearable data; it has never
 * written to their health record and should not start by accident.
 */

const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

/**
 * Must match HEALTH_CONNECT_READ_PERMISSIONS in services/health-connect.ts.
 * Same order, same set — the test compares them.
 */
const READ_PERMISSIONS = [
  'android.permission.health.READ_STEPS',
  'android.permission.health.READ_HEART_RATE',
  'android.permission.health.READ_SLEEP',
  'android.permission.health.READ_TOTAL_CALORIES_BURNED',
  'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
  'android.permission.health.READ_WEIGHT',
  'android.permission.health.READ_BLOOD_PRESSURE',
  'android.permission.health.READ_OXYGEN_SATURATION',
  // COS-932 — the readiness snapshot's two inputs.
  'android.permission.health.READ_RESTING_HEART_RATE',
  'android.permission.health.READ_RESPIRATORY_RATE',
];

const RATIONALE_ACTION = 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE';

module.exports = function withHealthConnect(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // ── 1. permissions ───────────────────────────────────────────────
    if (!Array.isArray(manifest['uses-permission'])) manifest['uses-permission'] = [];
    for (const name of READ_PERMISSIONS) {
      const already = manifest['uses-permission'].some(
        (p) => p?.$?.['android:name'] === name,
      );
      if (!already) manifest['uses-permission'].push({ $: { 'android:name': name } });
    }

    // ── 2. the privacy-policy rationale intent ───────────────────────
    //
    // Attached to MainActivity rather than a new activity: expo-router owns
    // the single-activity structure, and a second activity would need its own
    // React root just to render a link. The app handles the intent by
    // launching normally, which is what Health Connect's link expects.
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    if (!Array.isArray(activity['intent-filter'])) activity['intent-filter'] = [];
    const hasRationale = activity['intent-filter'].some((f) =>
      f?.action?.some?.((a) => a?.$?.['android:name'] === RATIONALE_ACTION),
    );
    if (!hasRationale) {
      activity['intent-filter'].push({
        action: [{ $: { 'android:name': RATIONALE_ACTION } }],
      });
    }

    return cfg;
  });
};

module.exports.READ_PERMISSIONS = READ_PERMISSIONS;
