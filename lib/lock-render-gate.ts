/**
 * COS-724 — decides whether the PIN lock should COVER the screen and whether it
 * should SWALLOW the Android back button. Pure, so it can be tested exhaustively
 * without a renderer or a navigator.
 *
 * ⚠️ NOT WIRED IN YET. Nothing imports this in the shipping tree. See the
 * "wiring" note at the bottom — the one line that activates it lives in
 * app/_layout.tsx and is deliberately left for a human to add and QA on a
 * device, because that line can white-screen the app if it is wrong.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * `isLocked` has never been a render gate. stores/security-store.tsx renders
 * `{children}` unconditionally; locking is purely `router.replace` to
 * /(security)/lock-screen (hooks/use-app-lock.ts). So the "lock" is one entry on
 * a navigation stack, and anything that changes that stack walks straight past
 * it onto live PHI. Four independent ways to do that were confirmed:
 *
 *   1. iOS left-edge swipe-back. `router.replace` swaps only the TOP stack entry
 *      (@react-navigation/routers StackRouter), so a root-level screen (/modal,
 *      /agency-detail, /appointments-modal, /calendar-event-*) stays mounted
 *      underneath. Nothing in the repo sets gestureEnabled, and headerShown:false
 *      does not disable the gesture. Swipe → the PHI screen is back.
 *   2. Android hardware back. Same mechanism, no BackHandler anywhere in the repo.
 *      (Not shipped yet — but it must be fixed BEFORE Android launch, not after.)
 *   3. Notification tap. hooks/use-notifications.ts calls router.push() with no
 *      lock check at all — verified, zero references to isAppLocked in that file.
 *      This one needs no precondition and is live on iOS today.
 *   4. Deep link / Universal Link. expo-router's linking handler, same story.
 *
 * lib/lock-gate.ts calls itself a "centralised lock-screen gate" and states "PHI
 * is never shown in the gap". Neither is true as written: it holds one boolean
 * and one deferred sign-in reason, and gates only the ORDERING of sign-in
 * redirects. It gates no request and no render. Its docblock is corrected
 * separately; the accurate name for it is "deferred sign-in queue".
 *
 * ── WHY A GATE HERE AND NOT IN SecurityProvider ────────────────────────────
 * The obvious move — have SecurityProvider return a lock screen instead of
 * {children} — is a COS-348 trap. Deciding "is this route allowlisted" requires
 * reading the route, and useSegments()/usePathname() return the default
 * `{ pathname: '/', segments: [] }` until the navigation container has mounted.
 * SecurityProvider renders ABOVE the navigator, so on first paint segments is
 * ALWAYS []. A gate that replaces {children} therefore prevents the navigator
 * from mounting, so segments never populates, so the gate never opens: a
 * permanent shield recoverable only by "clear app data". That is exactly the
 * COS-348 infinite-splash incident with a new coat of paint.
 *
 * An OVERLAY avoids this entirely, and the asymmetry is the whole argument:
 * because the navigator keeps rendering underneath, treating "I don't know where
 * I am" as GATED costs one frame of shield, not a deadlock. That lets the gate be
 * conservative — which a security gate must be — with no wedge risk.
 *
 * ── HONEST LIMITS OF "COVER" vs "UNMOUNT" ──────────────────────────────────
 * An overlay covers; it does not unmount. Three things it does NOT buy, stated
 * plainly rather than buried:
 *   (a) React Query keeps fetching PHI into cache while gated — lib/api-client.ts
 *       never consults isAppLocked().
 *   (b) An iOS `presentation:'modal'` route is a separately-presented
 *       UIViewController and renders ABOVE a root-level RN overlay. So the shield
 *       alone does not cover /modal, /agency-detail, /appointments-modal or
 *       /calendar-event-editor. This is why blocking inbound navigation while
 *       locked is load-bearing, not garnish: it removes the only remaining way to
 *       get a modal VC on screen while locked, since a user gesture is impossible
 *       (the shield eats touches) and notification/deep-link are the only
 *       programmatic sources.
 *   (c) The app-switcher snapshot is untouched. That needs a separate blur/privacy
 *       view on AppState change.
 */

/** expo-router's useSegments() output, e.g. ['Home','plan'] or ['(auth)','sign-in']. */
export type Segments = readonly string[];

export interface LockGateInput {
  /** SecurityProvider has finished reading Keychain. Before this, decide nothing. */
  isReady: boolean;
  /** No PIN configured → this whole feature is off. */
  isPinConfigured: boolean;
  isLocked: boolean;
  segments: Segments;
}

export interface LockGateDecision {
  /** Draw the opaque cover over the app. */
  shield: boolean;
  /** Swallow Android hardware back. */
  trapBack: boolean;
}

/**
 * Groups that must stay VISIBLE even while locked.
 *
 * (security) is here because the PIN pad has to be tappable — shielding the
 * unlock screen would be a perfect lockout.
 */
const SHIELD_ALLOWLIST: ReadonlySet<string> = new Set([
  '(auth)', // sign-in / sign-up / verify-email / terms / privacy-policy
  '(security)', // setup-pin / confirm-pin / enable-biometric / lock-screen
  '(onboarding)', // usage-guidelines / permissions / fasten-connect / welcome
]);

/**
 * Groups where Android back must keep working.
 *
 * NOTE THE ASYMMETRY WITH SHIELD_ALLOWLIST: `(security)` is deliberately ABSENT
 * here. That difference IS the android-hardware-back fix. The (security) stack
 * holds a single route, so react-navigation's useBackButton bubbles GO_BACK past
 * it to the ROOT stack and pops the lock screen off, revealing whatever was
 * underneath. Back on the lock screen must be swallowed.
 *
 * (auth) is the single most important entry in this set: a locked user with a
 * dead session — the exact COS-348 population — must have normal back behaviour
 * and must never be trapped. (onboarding) likewise for first-run users.
 */
const BACK_ALLOWLIST: ReadonlySet<string> = new Set(['(auth)', '(onboarding)']);

/**
 * Decide. Default-deny by group: any route whose group is not explicitly
 * allowlisted is gated, so a screen added in future is protected with no code
 * change.
 */
export function computeLockGate(input: LockGateInput): LockGateDecision {
  const { isReady, isPinConfigured, isLocked, segments } = input;

  // Nothing is decided until the security state has actually resolved, and the
  // whole feature is inert without a PIN.
  if (!isReady || !isPinConfigured || !isLocked) {
    return { shield: false, trapBack: false };
  }

  // segments === [] is the SplashGate (app/index.tsx), not "unknown route".
  // It must render: it owns the logo/spinner AND the offline "Retry" card, and
  // shielding it would leave the user unable to tap Retry — a COS-348 wedge.
  // It shows no PHI, and it replaces itself out of the stack at boot so it
  // cannot be popped back to.
  if (segments.length === 0) {
    return { shield: false, trapBack: false };
  }

  const group = segments[0];

  return {
    shield: !SHIELD_ALLOWLIST.has(group),
    trapBack: !BACK_ALLOWLIST.has(group),
  };
}

/**
 * WIRING (left for a human, deliberately).
 *
 * In app/_layout.tsx, as a SIBLING rendered AFTER the Stack inside the existing
 * root <View style={{flex:1}}> — never wrapping it:
 *
 *     <View style={{ flex: 1 }}>
 *       <StackWithAppLock />
 *       <LockShield />          // ← the one line
 *     </View>
 *
 * Why this is not already done: that line sits inside every provider and above
 * the navigator. If LockShield throws on mount, the whole app white-screens —
 * the highest-blast-radius edit available in this codebase, in an app with a
 * documented crash history. It wants a device pass on the resume path (the
 * triple-Face-ID bug, the unlock-flash race, and 401-during-resume all live
 * there) before it goes anywhere near a build.
 *
 * Rollback is deleting that one line and re-publishing; no native rebuild.
 */
