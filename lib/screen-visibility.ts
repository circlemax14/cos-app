/**
 * COS-1061 — the two-axis screen decision, as a pure function.
 *
 * Split out of use-feature-permissions.ts for the same reason
 * lib/entitlement-decision.ts was split out of use-entitlement.ts: every
 * branch can then be tested without a renderer, a device, or React Native —
 * which `node --test` cannot load at all.
 *
 * ─── THE TWO AXES ────────────────────────────────────────────────────
 *
 *   1. LAUNCHED — is this feature built and switched on platform-wide?
 *      Set in the dashboard's Feature Control. Nothing to do with money.
 *   2. PLAN — does this patient's plan include it?
 *
 * Vishal: *"within the app both checks need to be mandatory when we are
 * showing that feature."*
 *
 * ─── ABSENT MEANS YES, EVERYWHERE ────────────────────────────────────
 *
 * Every test here is `=== false`, never `!value`. Three different things
 * produce an absent answer and none of them mean "hidden":
 *
 *   - a route the catalog has never heard of
 *   - a response from an API that predates the field
 *   - a query still in flight
 *
 * Reading any of those as "not launched" hides the whole app, and the bug
 * would look like a policy decision rather than a version skew.
 */

export interface ScreenAccessLike {
  enabled: boolean;
  reason?: string;
}

/**
 * Should this route render?
 *
 * @param route    app route name (`health-plan`, `index`) or catalog featureKey
 * @param screens  the combined per-screen map from /feature-permissions
 * @param launched the raw launch map from the same response
 */
export function decideScreenVisible(
  route: string,
  screens: Record<string, ScreenAccessLike> | undefined,
  launched: Record<string, boolean> | undefined,
): boolean {
  /*
   * The launch axis is checked FIRST and can only ever hide.
   *
   * On a fresh payload this agrees with `screens`, which the server has
   * already combined. It earns its place on a STALE one: the app holds this
   * response for five minutes and caches it across launches, so a feature
   * switched off a minute ago can still arrive here as `enabled: true`. The
   * newer fact wins, whichever field carries it.
   */
  if (launched?.[route] === false) return false;

  const screen = screens?.[route];

  // The server's own word for the same thing, for a client whose `launched`
  // map is missing but whose `screens` is current.
  if (screen?.reason === 'not-launched') return false;

  // Unknown route, in-flight query, older API: visible. Hiding navigation on a
  // slow network is a worse failure than briefly showing a screen the plan
  // does not include — and the boot gate means "briefly" is now rare.
  return screen?.enabled ?? true;
}

/** Is this feature switched on platform-wide, ignoring the plan entirely? */
export function decideFeatureLaunched(
  key: string,
  screens: Record<string, ScreenAccessLike> | undefined,
  launched: Record<string, boolean> | undefined,
): boolean {
  if (launched?.[key] === false) return false;
  return screens?.[key]?.reason !== 'not-launched';
}

/**
 * Validate a screen map read back off disk.
 *
 * A corrupted or hand-edited value must not become a confident answer about
 * what a patient can see, and an EMPTY screens map is not an answer — it is
 * what a half-written record looks like, and it would read as "every route
 * unknown" for the life of the install.
 */
export function isCachedScreenAccess(v: unknown): v is {
  screens: Record<string, boolean>;
  launched: Record<string, boolean>;
  at: number;
} {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.at !== 'number') return false;
  for (const field of ['screens', 'launched'] as const) {
    const m = o[field];
    if (typeof m !== 'object' || m === null || Array.isArray(m)) return false;
    if (Object.values(m as Record<string, unknown>).some((x) => typeof x !== 'boolean')) return false;
  }
  return Object.keys(o.screens as Record<string, boolean>).length > 0;
}
