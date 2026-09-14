/**
 * COS-928 — declare the intents Android 11+ requires us to ask about.
 *
 * ─── THE BUG ─────────────────────────────────────────────────────────
 *
 * Android 11 (API 30) introduced package visibility filtering: `canOpenURL()`
 * returns FALSE for any scheme the app has not declared in <queries>, even
 * when a handler is installed and even when `Linking.openURL` would have
 * worked fine. targetSdk here is 36.
 *
 * The committed manifest declares exactly one query — VIEW/BROWSABLE/https —
 * so `tel:`, `mailto:` and `sms:` all report "no handler". Every Call, Text
 * and Email button in the app guards on `canOpenURL` first and therefore does
 * nothing on Android: the doctor detail screen, the care-circle contact rows,
 * the agency detail screen and the support screen among them. Silent, with no
 * error — the button just does not respond.
 *
 * ─── WHY A CONFIG PLUGIN AND NOT A MANIFEST EDIT ─────────────────────
 *
 * `app.json` has no schema for <queries>, so this cannot be expressed there.
 * Hand-editing android/app/src/main/AndroidManifest.xml works until the next
 * `expo prebuild`, which regenerates the file from the template and silently
 * drops it — which is exactly how the SCRUM-368 backup attributes came to be
 * one prebuild away from being lost. A plugin runs as part of prebuild, so the
 * declaration survives every regeneration by construction.
 *
 * Nothing here touches iOS. Package visibility filtering is an Android-only
 * mechanism; iOS uses LSApplicationQueriesSchemes in Info.plist and already
 * works.
 */

const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Schemes the app calls `Linking.canOpenURL` on.
 *
 * Keep this list to schemes we ACTUALLY open. Each entry is a declaration to
 * Google Play that the app inspects for that capability, and an unused one is
 * a question we have to answer on the data-safety form for no benefit.
 */
const SCHEMES = ['tel', 'mailto', 'sms'];

module.exports = function withAndroidIntentQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // The template ships a <queries> block for https; add to it rather than
    // replacing, or the browser check that deep links rely on disappears.
    if (!Array.isArray(manifest.queries)) manifest.queries = [{}];
    const queries = manifest.queries[0];
    if (!Array.isArray(queries.intent)) queries.intent = [];

    for (const scheme of SCHEMES) {
      const already = queries.intent.some(
        (i) => i?.data?.some?.((d) => d?.$?.['android:scheme'] === scheme),
      );
      if (already) continue;
      queries.intent.push({
        action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
        data: [{ $: { 'android:scheme': scheme } }],
      });
    }

    return cfg;
  });
};
