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
 *  2. NOTHING ABOUT THE RATIONALE INTENT — see below. That is the library's
 *     own plugin's job, and taking it over is what broke the permission
 *     dialog for a week.
 *
 *  3. The `<queries>` entry for com.google.android.apps.healthdata, so
 *     Android 11+ package visibility does not hide Health Connect from us.
 *     react-native-health-connect's own manifest already contributes this, so
 *     it is NOT re-declared here — duplicating it is harmless but implies we
 *     own it, and the next person would have two places to keep in sync.
 *
 * ─── WHY THIS NO LONGER TOUCHES THE RATIONALE INTENT ─────────────────
 *
 * COS-936. This plugin used to declare
 * `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` on MainActivity, copied
 * from react-native-health-connect's own app.plugin.js — but only HALF of what
 * that plugin does.
 *
 * On Android 14+ the rationale is not reached through that action at all. It
 * is an `<activity-alias>` handling `ACTION_VIEW_PERMISSION_USAGE` with the
 * category `android.intent.category.HEALTH_PERMISSIONS`, guarded by
 * `START_VIEW_PERMISSION_USAGE`. And AOSP's PermissionsActivity treats it as a
 * HARD GATE, not a nicety:
 *
 *     val rationaleIntentDeclared =
 *         healthPermissionReader.isRationaleIntentDeclared(getPackageNameExtra())
 *     if (!rationaleIntentDeclared) {
 *         Log.e(TAG, "App should support rationale intent, finishing!")
 *         finish()
 *     }
 *
 * isRationaleIntentDeclared probes ACTION_VIEW_PERMISSION_USAGE — never the
 * androidx action, which the controller only uses to build its "this app is
 * out of date" list. So declaring the legacy action alone reads as declaring
 * nothing, and the permission screen kills itself in onCreate. Observed on a
 * Galaxy S26: dialog started, top, and finishing within 7ms, resolving to an
 * empty granted set with no error and nothing on screen.
 *
 * The library ships app.plugin.js which does BOTH halves correctly and is
 * createRunOncePlugin. It is now registered in app.json, and this plugin
 * stays out of its way. The lesson is narrow and worth keeping: do not
 * reimplement a library's own config plugin — copying half of one is
 * indistinguishable from configuring it wrong.
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
  // COS-934 — the last three vitals tiles. READ_STEPS is already above.
  'android.permission.health.READ_BLOOD_GLUCOSE',
  'android.permission.health.READ_HEART_RATE_VARIABILITY',
  // COS-935 — the rest of what iOS reads. Height is only for deriving BMI,
  // which Health Connect has no record for.
  'android.permission.health.READ_BODY_TEMPERATURE',
  'android.permission.health.READ_HEIGHT',
  'android.permission.health.READ_DISTANCE',
  'android.permission.health.READ_FLOORS_CLIMBED',
  'android.permission.health.READ_EXERCISE',
];


module.exports = function withHealthConnect(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // The 17 READ permissions. Health Connect reads the MANIFEST to decide
    // what it will even prompt for, so one missing here is silently never
    // granted.
    if (!Array.isArray(manifest['uses-permission'])) manifest['uses-permission'] = [];
    for (const name of READ_PERMISSIONS) {
      const already = manifest['uses-permission'].some(
        (p) => p?.$?.['android:name'] === name,
      );
      if (!already) manifest['uses-permission'].push({ $: { 'android:name': name } });
    }

    return cfg;
  });
};

module.exports.READ_PERMISSIONS = READ_PERMISSIONS;
