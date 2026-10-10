/**
 * GP-02 — make Health Connect's "privacy policy" link actually show it.
 *
 * Health Connect's permission screen has a privacy-policy link. Tapping it
 * launches our app with
 *   - androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE   (Android 13 and lower)
 *   - android.intent.action.VIEW_PERMISSION_USAGE         (14+, through the
 *     ViewPermissionUsageActivity alias)
 * Both are declared — by react-native-health-connect's OWN plugin, and they
 * must stay exactly as it writes them (COS-936: AOSP's PermissionsActivity
 * finishes itself unless the alias is declared). But both target MainActivity
 * and carry no data URI, so nothing reacted: the app booted to sign-in / the
 * PIN / Home and the patient never saw a policy.
 *
 * developer.android.com Health Connect get-started: "The activity must display
 * the same privacy policy you provide for your app in the Google Play Console."
 *
 * This plugin does NOT touch the manifest. It adds to MainActivity a rewrite
 * of those two actions into the deep link cos://privacy-policy, which
 * expo-router resolves to app/(auth)/privacy-policy.tsx. onCreate covers a
 * cold launch; onNewIntent covers a running app (launchMode singleTask).
 *
 * android/ is committed, so the same block is in MainActivity.kt; the test
 * asserts the committed file equals what this plugin would generate.
 */

const { withMainActivity } = require('@expo/config-plugins');

const TAG = 'csh-hc-rationale';
const ROUTE = 'cos://privacy-policy';

const METHODS = `  // @generated begin ${TAG} (plugins/withHealthConnectRationaleRoute.js)
  override fun onNewIntent(intent: Intent) {
    routeHealthConnectRationale(intent)
    super.onNewIntent(intent)
  }

  /**
   * GP-02 — Health Connect's privacy-policy link arrives as a rationale action
   * with no URI. Turn it into the ${ROUTE} deep link.
   */
  private fun routeHealthConnectRationale(i: Intent?) {
    if (i == null) return
    val action = i.action ?: return
    if (action == "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" ||
        action == "android.intent.action.VIEW_PERMISSION_USAGE") {
      i.action = Intent.ACTION_VIEW
      i.data = Uri.parse("${ROUTE}")
    }
  }
  // @generated end ${TAG}

`;

/** Pure transform of MainActivity.kt source. Idempotent. */
function addRationaleRouting(src) {
  if (src.includes(`@generated begin ${TAG}`)) return src;
  let out = src;

  for (const imp of ['import android.content.Intent', 'import android.net.Uri']) {
    if (!out.includes(imp)) out = out.replace('import android.os.Bundle', `${imp}\nimport android.os.Bundle`);
  }

  const superCall = '    super.onCreate(null)';
  if (!out.includes(superCall)) throw new Error(`[${TAG}] MainActivity.onCreate shape changed`);
  out = out.replace(superCall, `    routeHealthConnectRationale(intent) // ${TAG}\n${superCall}`);

  const anchor = '  /**\n   * Returns the name of the main component';
  if (!out.includes(anchor)) throw new Error(`[${TAG}] MainActivity anchor not found`);
  out = out.replace(anchor, METHODS + anchor);
  return out;
}

module.exports = function withHealthConnectRationaleRoute(config) {
  return withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') {
      throw new Error(`[${TAG}] expected a Kotlin MainActivity`);
    }
    cfg.modResults.contents = addRationaleRouting(cfg.modResults.contents);
    return cfg;
  });
};

module.exports.addRationaleRouting = addRationaleRouting;
module.exports.ROUTE = ROUTE;
