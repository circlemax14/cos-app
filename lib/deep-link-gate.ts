/**
 * MOB-01 — the decision behind app/+native-intent.ts redirectSystemPath, with
 * its dependencies injected so node --test can call it with REAL URLs.
 *
 * The COS-778 guard began with `if (!path.startsWith('/')) return path;`. But
 * expo-router 55 hands redirectSystemPath the RAW inbound URL
 * (node_modules/expo-router/build/getLinkingConfig.js:72 and
 * build/link/linking.js:118-120): `cos://Home/x`,
 * `https://circlesupporthealth.ai/Home/x`. No real deep link starts with '/',
 * so every one of them skipped both the cold-start and the locked checks and
 * opened PHI past the PIN. The old test only regex-matched the source.
 *
 * Fix: reduce the URL to an in-app path FIRST, then apply the checks to that.
 * Anything we cannot reduce fails CLOSED whenever a lock could apply.
 */
import { extractExpoPathFromURL } from 'expo-router/build/fork/extractPathFromURL.js';

/**
 * The in-app path a URL points at, or null when it cannot be determined.
 *
 *   '/Home/x?a=1'                          → '/Home/x?a=1'
 *   'cos://Home/x?a=1'                     → '/Home/x?a=1'  (custom-scheme host
 *                                             is the first segment, as in
 *                                             expo-router's extractPathFromURL)
 *   'https://circlesupporthealth.ai/Home/x' → '/Home/x'
 *   'exp://192.168.0.2:8081/--/Home/x'     → '/Home/x'      (Expo dev URLs)
 *
 * Used to pick the route to DEFER (opened only after unlock). The decision to
 * open a link past the lock does NOT use this — see isPublicLink.
 */
export function toInAppPath(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const s = url.trim();
  if (!s) return null;
  if (s.startsWith('/')) return s;

  const m = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(s);
  if (!m) return null;
  const scheme = m[1].toLowerCase();
  let rest = m[2];

  // Expo Go's '/--/' marker: only for exp/exps, and only in the path part —
  // never in a query or fragment ('cos://Home/x?y=/--/privacy-policy').
  if (scheme === 'exp' || scheme === 'exps') {
    const pathPart = rest.split(/[?#]/, 1)[0];
    const dash = pathPart.indexOf('/--/');
    if (dash > -1) return '/' + rest.slice(dash + 4);
  }

  if (scheme === 'http' || scheme === 'https') {
    // Drop the authority; keep path + query + fragment.
    const cut = rest.search(/[/?#]/);
    rest = cut === -1 ? '' : rest.slice(cut);
    if (!rest.startsWith('/')) rest = '/' + rest;
    return rest;
  }

  // Custom scheme: the "host" is the first path segment.
  return '/' + rest.replace(/^\/+/, '');
}

/** Screens with no PHI that a deep link may open past the lock. */
export const PUBLIC_PATHS: ReadonlySet<string> = new Set(['/privacy-policy']);

/**
 * True when the ROUTER will open a public screen for this URL.
 *
 * Decided with expo-router's own URL → path function (the one router-store and
 * useLinking call on the same URL), not with toInAppPath: a link may only skip
 * the lock if the gate and the router agree on where it goes. A private parser
 * here let 'cos://Home/personal-info?x=/--/privacy-policy' pass as the policy
 * while the router opened Personal Info.
 */
export function isPublicLink(url: string): boolean {
  let routed: string;
  try {
    routed = extractExpoPathFromURL([], url);
  } catch {
    return false;
  }
  return PUBLIC_PATHS.has('/' + routed.replace(/[?#].*$/, ''));
}

export interface InboundDeps {
  isPinSetup: () => Promise<boolean>;
  isAppLocked: () => boolean;
  deferNavigation: (route: string) => void;
}

/**
 * Same contract as redirectSystemPath: return the path to open, or null to
 * tell expo-router not to navigate (the link is deferred until unlock).
 */
export async function decideInboundLink(
  { path, initial }: { path: string; initial: boolean },
  deps: InboundDeps,
): Promise<string | null> {
  // COS-1251 — Apple's answer on Android (cos://auth/apple?id_token=…). It is
  // not a screen: the sign-in that opened Apple's page is waiting for it.
  if (typeof path === 'string' && /^(?:cos:\/\/|\/)auth\/apple(?:[/?#]|$)/.test(path)) return null;

  // Public, PHI-free screens open even while locked. GP-02: Health Connect's
  // privacy-policy link arrives as cos://privacy-policy and must show the
  // policy, not the PIN pad.
  if (typeof path === 'string' && isPublicLink(path)) return path;

  const inApp = toInAppPath(path);

  if (initial) {
    // Cold start: decide from STORAGE — the in-memory lock is not yet
    // authoritative. See app/+native-intent.ts.
    let pinConfigured = false;
    try {
      pinConfigured = await deps.isPinSetup();
    } catch {
      // Cannot tell. Deferring a link is recoverable; showing PHI is not.
      pinConfigured = true;
    }
    if (!pinConfigured) return path;
    if (inApp) deps.deferNavigation(inApp);
    return null;
  }

  /*
   * KNOWN GAP (not closed here; tracked with the unwired LockShield render
   * gate): a PIN user who BACKGROUNDS the app and then taps a link. The lock
   * flag only turns true in use-app-lock's AppState 'active' handler (or the
   * idle timer), and Android onNewIntent / iOS openURL deliver the 'url' event
   * BEFORE that, so this check still reads false, the link passes, and the PHI
   * screen mounts until captureAndLock replaces it. This branch protects an app
   * that is ALREADY on the lock screen.
   */
  if (deps.isAppLocked()) {
    if (inApp) deps.deferNavigation(inApp);
    return null;
  }

  return path;
}
