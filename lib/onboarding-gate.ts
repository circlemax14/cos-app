/**
 * COS-1235 — THE ONE ONBOARDING LADDER.
 *
 * ─── WHY IT IS A MODULE, AND WHY IT IS PURE ──────────────────────────
 *
 * There were THREE copies of this ladder: `getDestination` in app/index.tsx,
 * `handleRoute` in app/(auth)/sign-in.tsx, and `routeNext` in
 * app/(onboarding)/permissions.tsx. They had already drifted (sign-in grew two
 * `ehiExport*` branches that land on the same screen as the branch above them;
 * index grew a welcome step the others never had), and a routing rule that has to
 * be written correctly three times is a rule that will be wrong in at least one
 * of them. All three now call this.
 *
 * Pure, and free of react-native and expo-router, so `node --test` can drive
 * every branch without a renderer. See lib/onboarding-gate.test.mjs.
 *
 * ─── THE BLOCKER IT EXISTS TO FIX ────────────────────────────────────
 *
 * `!fastenConnected` sent EVERYBODY to /(onboarding)/fasten-connect, whose only
 * two ways out are "Connect a Clinic" and "Sign out". So the person who installed
 * the app BECAUSE somebody invited them to a care circle was funnelled into
 * connecting a clinic — and could never reach the Supports modal or the Home card
 * where their invitation lives. The flow dead-ended for exactly the population it
 * was built for.
 *
 * ─── WHAT WAS CHOSEN, AND WHY ────────────────────────────────────────
 *
 * The invitation is NOT surfaced inside the EHR screens, and there is no "skip"
 * button for everyone. The EHR and data-processing gates are PATIENT gates, and an
 * invitee is not a patient signing themselves up: they may have no clinic, no
 * records, and no reason to connect one. So for them those two gates are simply
 * not gates — `ehrOnboardingOptional` comes back from GET /v1/auth/me and they
 * land on Home, where ReceivedInvitations is already mounted on both render paths.
 *
 * Three reasons that beats surfacing the invitation during onboarding:
 *   - Accepting it there would still have left them on "connect your clinic"
 *     afterwards, with nothing else in the app reachable. It unblocks the tap and
 *     not the person.
 *   - The decision is one the SERVER can make correctly and durably (a live
 *     invitation OR any row in the social graph, so it survives the accept that
 *     consumes the invitation). A client-side "Not now" flag would be re-derived
 *     from scratch on every reinstall.
 *   - It costs no new screen, no AsyncStorage key, and nothing at all for the 26
 *     patients who do connect a clinic.
 *
 * TERMS ARE STILL MANDATORY FOR EVERYONE. That one is legal, not product.
 */

/** Only the fields that decide a route. A subset of /v1/auth/me's body. */
export interface GateProfile {
  termsAccepted?: boolean;
  fastenConnected?: boolean;
  dataReady?: boolean;
  /**
   * COS-1235 — the server says this account is here for a care circle rather than
   * for its own medical records, so connecting a clinic is optional. Absent on a
   * cached profile written by an older build, which reads as `false` — the old
   * behaviour, never a crash.
   */
  ehrOnboardingOptional?: boolean;
}

export const ONBOARDING_ROUTES = {
  usageGuidelines: '/(onboarding)/usage-guidelines',
  permissions: '/(onboarding)/permissions',
  fastenConnect: '/(onboarding)/fasten-connect',
  dataProcessing: '/(onboarding)/data-processing',
} as const;

export interface Gate {
  /** The screen that must be completed first, or null when nothing is in the way. */
  route: string | null;
  /**
   * Mark the one-time permission prompt as already shown WITHOUT showing it.
   *
   * A returning user with cleared local state (reinstall, "clear app data", device
   * migration) must not be replayed through onboarding screens whose server-side
   * equivalents already say "done". The caller owns the AsyncStorage write because
   * this function is pure.
   */
  backfillPermissions: boolean;
}

/**
 * Where this user has to go first, if anywhere.
 *
 * `permissionsRequested` is the local one-time flag; everything else is the
 * backend's word, which is the source of truth for onboarding state.
 */
export function onboardingGate(
  user: GateProfile,
  opts: { permissionsRequested: boolean },
): Gate {
  const no = { route: null as string | null, backfillPermissions: false };

  // Legal, and it applies to every account including an invitee's.
  if (!user.termsAccepted) return { ...no, route: ONBOARDING_ROUTES.usageGuidelines };

  const ehrOptional = user.ehrOnboardingOptional === true;
  // "Nothing left for onboarding to ask about" — which for an invitee is true
  // without an EHR connection, because the EHR is not what they came for.
  const nothingLeft = (user.fastenConnected === true && user.dataReady === true) || ehrOptional;

  let backfillPermissions = false;
  if (!opts.permissionsRequested) {
    if (nothingLeft) backfillPermissions = true;
    else return { ...no, route: ONBOARDING_ROUTES.permissions };
  }

  // THE FIX. Both of the next two are patient gates, and an invitee is not held
  // by either: their records are not why they are here.
  if (!ehrOptional) {
    if (!user.fastenConnected) {
      return { route: ONBOARDING_ROUTES.fastenConnect, backfillPermissions };
    }
    /*
     * Connected, export still running — or failed. All three of sign-in's old
     * branches (`ehiExportPending`, `ehiExportFailed`, plain `fastenConnected`)
     * landed on this same screen, which is why they collapse into one line here.
     */
    if (!user.dataReady) {
      return { route: ONBOARDING_ROUTES.dataProcessing, backfillPermissions };
    }
  }

  return { route: null, backfillPermissions };
}
