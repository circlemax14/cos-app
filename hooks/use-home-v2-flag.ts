/**
 * hooks/use-home-v2-flag.ts — ADR-0003 Phase 1 (Home Redesign)
 *
 * Strict, module-level truthiness gates for the Home v2 redesign so
 * every consumer reads the *same* boolean and rollback via env is a
 * one-line flip. Env vars follow the shipped cos-app convention (see
 * hooks/use-entitlements-sync.ts lines 33-36):
 *
 *   String(process.env.EXPO_PUBLIC_<NAME> ?? '')
 *     .toLowerCase()
 *     .trim() === 'true'
 *
 * Why STRICT === 'true' (not JSON.parse, not falsy-check): a stray
 * "1", "yes", or "on" during OTA rollout would silently enable the
 * new surface. The BPS/plan rollout playbook (memory:feedback_dark_
 * launch_via_ssm_before_code) mandates flags default OFF; strict
 * equality guarantees an unset / mis-set env cannot flip us on.
 *
 * All three exports are pure, synchronous, and safe to call at module
 * top level or inside a render — process.env is inlined by the Expo
 * bundler at build time, so calls are effectively free.
 *
 * ADR-0003 kill-switch envelope (iOS 26.5 hardening):
 *   - EXPO_PUBLIC_HOME_V2_ENABLED=false  → old Home renders bit-identical
 *   - EXPO_PUBLIC_HOME_V2_ENABLED=true   → new ScoreCardGrid surface
 *   - EXPO_PUBLIC_HOME_V2_PLACEHOLDERS_ENABLED=true → shim data OK for
 *     internal-only dogfood cohorts before real data lands
 *   - EXPO_PUBLIC_HOME_CIRCLE_PROMINENCE ∈ {secondary,primary,hidden}
 *     controls how loudly the Care Circle rail shouts on the redesigned
 *     Home. Default = 'secondary' (calm; the ScoreCards own the fold).
 */

export type HomeCircleProminence = 'primary' | 'secondary' | 'hidden'

/**
 * Normalize an unknown env value to strict `'true'`. Any deviation
 * (undefined, empty string, whitespace, casing weirdness) → false.
 * Centralized so the three exports below can't drift from each other.
 */
function envTrue(raw: string | undefined): boolean {
  return String(raw ?? '').toLowerCase().trim() === 'true'
}

/**
 * Master gate for the Home v2 redesign. Default OFF.
 * Prefer this over reading process.env directly at call sites — a
 * consumer that misspells the var (e.g. HOME_V2_ENABLE vs _ENABLED)
 * would ship broken; every call routing through this fn keeps the
 * spelling in exactly one place.
 */
export function isHomeV2Enabled(): boolean {
  return envTrue(process.env.EXPO_PUBLIC_HOME_V2_ENABLED)
}

/**
 * Independent sub-gate for placeholder data on the v2 surface. Split
 * from the master gate so QA can turn on the shell (empty states) in
 * one environment while placeholders roll out separately in another.
 * Default OFF.
 */
export function isHomeV2PlaceholdersEnabled(): boolean {
  return envTrue(process.env.EXPO_PUBLIC_HOME_V2_PLACEHOLDERS_ENABLED)
}

/**
 * Care Circle prominence on the redesigned Home. Reads
 * EXPO_PUBLIC_HOME_CIRCLE_PROMINENCE and coerces unknown values to
 * the safe default of `secondary` — the ADR-0003-approved calm tier.
 * Kept as an explicit switch (not a boolean) because Ken wants a
 * three-state tuning knob during rollout, not a binary flip.
 */
export function getHomeCircleProminence(): HomeCircleProminence {
  const raw = String(process.env.EXPO_PUBLIC_HOME_CIRCLE_PROMINENCE ?? '')
    .toLowerCase()
    .trim()
  if (raw === 'primary') return 'primary'
  if (raw === 'hidden') return 'hidden'
  // Unknown / empty / typo → 'secondary'. Deliberately does not throw:
  // an OTA-shipped typo must degrade to the calm default, never crash.
  return 'secondary'
}
