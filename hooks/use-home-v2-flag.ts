/**
 * hooks/use-home-v2-flag.ts — ADR-0003 Phase 1 (Home Redesign)
 *
 * SCRUM-651 migration: `isHomeV2Enabled()` now reads the backend
 * feature-flag registry (`GET /v1/feature-flags`, key `HOME_V2_ENABLED`)
 * via `useHomeV2RegistryFlag`. The build-time `EXPO_PUBLIC_HOME_V2_ENABLED`
 * env var remains a cold-start fallback for the ~200ms window before
 * the flags query resolves — so a warm bundle with EXPO baking still
 * gates correctly on the first frame, and the registry takes over once
 * the query lands. Both surfaces default OFF.
 *
 * Signature preserved (still a sync-shaped `() => boolean`) so no call
 * site moves — but the function now transitively calls a React hook,
 * so it MUST be invoked inside a component render path. Every current
 * caller already does this (rendered from `app/Home/index.tsx`).
 *
 * Env parsing follows the shipped cos-app convention:
 *
 *   String(process.env.EXPO_PUBLIC_<NAME> ?? '')
 *     .toLowerCase()
 *     .trim() === 'true'
 *
 * STRICT === 'true' (not JSON.parse, not falsy-check): a stray "1",
 * "yes", or "on" during OTA rollout would silently enable the new
 * surface. The BPS/plan rollout playbook (memory:feedback_dark_launch_
 * via_ssm_before_code) mandates flags default OFF; strict equality
 * guarantees an unset / mis-set env cannot flip us on.
 *
 * `isHomeV2PlaceholdersEnabled` and `getHomeCircleProminence` stay
 * env-var-only for now — non-critical UX toggles that don't warrant
 * their own registry keys yet (per SCRUM-651 scope).
 *
 * ADR-0003 kill-switch envelope (iOS 26.5 hardening):
 *   - Registry `HOME_V2_ENABLED=true`     → new ScoreCardGrid surface
 *   - Registry unset / false              → env fallback path (below)
 *   - EXPO_PUBLIC_HOME_V2_ENABLED=false   → old Home renders bit-identical
 *   - EXPO_PUBLIC_HOME_V2_PLACEHOLDERS_ENABLED=true → shim data OK for
 *     internal-only dogfood cohorts before real data lands
 *   - EXPO_PUBLIC_HOME_CIRCLE_PROMINENCE ∈ {secondary,primary,hidden}
 *     controls how loudly the Care Circle rail shouts on redesigned
 *     Home. Default = 'secondary' (calm; the ScoreCards own the fold).
 */

import { useFeatureFlags } from './use-feature-flags';

export type HomeCircleProminence = 'primary' | 'secondary' | 'hidden';

/**
 * Normalize an unknown env value to strict `'true'`. Any deviation
 * (undefined, empty string, whitespace, casing weirdness) → false.
 * Centralized so the exports below can't drift from each other.
 */
function envTrue(raw: string | undefined): boolean {
  return String(raw ?? '').toLowerCase().trim() === 'true';
}

/**
 * Master gate for the Home v2 redesign. Default OFF.
 *
 * Precedence:
 *   1. Backend registry (`HOME_V2_ENABLED`) once `useFeatureFlags`
 *      has resolved. Strict `=== true`; missing key → false.
 *   2. Build-time env var (`EXPO_PUBLIC_HOME_V2_ENABLED`) during the
 *      cold-start window before the flags query lands.
 *
 * Must be called from a component render — it transitively invokes
 * a React hook. Every existing caller already does.
 */
export function isHomeV2Enabled(): boolean {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- SCRUM-651: preserving legacy sync-shaped signature; every caller renders inside a component.
  const { data } = useFeatureFlags();
  if (data === undefined) {
    // Cold-start (flags query in-flight or errored). Fall back to the
    // build-time env so a warm OTA bundle with EXPO baking still gates
    // correctly on the very first frame — no flash of legacy Home.
    return envTrue(process.env.EXPO_PUBLIC_HOME_V2_ENABLED);
  }
  return data.HOME_V2_ENABLED === true;
}

/**
 * Independent sub-gate for placeholder data on the v2 surface. Split
 * from the master gate so QA can turn on the shell (empty states) in
 * one environment while placeholders roll out separately in another.
 * Default OFF. Env-var-only for now (SCRUM-651 out-of-scope).
 */
export function isHomeV2PlaceholdersEnabled(): boolean {
  return envTrue(process.env.EXPO_PUBLIC_HOME_V2_PLACEHOLDERS_ENABLED);
}

/**
 * Care Circle prominence on the redesigned Home. Reads
 * EXPO_PUBLIC_HOME_CIRCLE_PROMINENCE and coerces unknown values to
 * the safe default of `secondary` — the ADR-0003-approved calm tier.
 * Kept as an explicit switch (not a boolean) because Ken wants a
 * three-state tuning knob during rollout, not a binary flip.
 * Env-var-only for now (SCRUM-651 out-of-scope).
 */
export function getHomeCircleProminence(): HomeCircleProminence {
  const raw = String(process.env.EXPO_PUBLIC_HOME_CIRCLE_PROMINENCE ?? '')
    .toLowerCase()
    .trim();
  if (raw === 'primary') return 'primary';
  if (raw === 'hidden') return 'hidden';
  // Unknown / empty / typo → 'secondary'. Deliberately does not throw:
  // an OTA-shipped typo must degrade to the calm default, never crash.
  return 'secondary';
}
