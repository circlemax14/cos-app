/**
 * COS-1236 — how the social screens hand off to each other.
 *
 * Two pieces of glue. Both pure enough (or small enough) to drive from
 * node --test, which is why they are here and not inline in three screens.
 *
 * ─── 1. WHERE BACK GOES ──────────────────────────────────────────────
 *
 * Vishal, 2026-10-01: "this Find people, if I go there, if I click on the back
 * icon, it is taking me to the home screen. Ideally it should take me to the
 * inbox screen."
 *
 * find-people and connection-requests are app/Home/* routes hidden with
 * `href:null`, so a push from the Inbox tab is a push INSIDE that tab's stack
 * and `router.back()` pops to the tab's initial route — Home. It is not that
 * the destination was wrong, it is that nothing was ever told where to go.
 *
 * Same convention as the assessment stepper's `resolveReturnHref` (COS-1186):
 * a TOKEN resolved through a switch, never an arbitrary pathname, so a shared
 * deep link cannot turn a Back button into an open redirect. One function
 * rather than a copy per screen — the three drifted copies of the onboarding
 * ladder are the reason that rule exists here at all.
 *
 * ─── 2. THE INVITE INTENT ────────────────────────────────────────────
 *
 * Vishal: "if I click on 'someone missing from here' it is opening the support
 * modal and going to the social tab, but it should also open that form where we
 * are entering this email invitation."
 *
 * The form is a MODE of SocialPanel, and the panel cannot be told which mode to
 * open in: `<SocialPanel />` is pinned by two separate assertions in
 * tests/unit/social-tab-entry.test.ts, and importing expo-router there is
 * banned by the same file. So the caller leaves a one-shot note here and the
 * panel reads it as it mounts. Module scope, exactly like modal.tsx's own
 * `sessionRecencyFilter`.
 */

/**
 * Where Back goes from find-people / connection-requests.
 *
 * Unknown and absent tokens keep the historic destination, so an older deep
 * link, a push notification or a caller that names nothing behaves as before.
 */
export function socialReturnHref(returnTo: string | undefined): string {
  switch (returnTo) {
    case 'inbox':
      return '/Home/inbox';
    default:
      return '/Home';
  }
}

/**
 * ponytail: one module-level boolean, consumed once. If a second screen ever
 * needs to open a different mode, this becomes a `Mode | null` — not a store.
 */
let inviteIntent = false;

/** Ask the next SocialPanel mount to open on the invite sheet. */
export function requestInviteSheet(): void {
  inviteIntent = true;
}

/**
 * Read AND clear. One shot is the whole safety property: a note that outlived
 * its navigation would open the invite sheet the next time anybody opened the
 * Supports modal for any other reason.
 */
export function consumeInviteSheetIntent(): boolean {
  const wanted = inviteIntent;
  inviteIntent = false;
  return wanted;
}
