/**
 * SCRUM-642 — Health Age kill-switch.
 *
 * Reads off the shared `useFeatureFlags` query so it can be flipped
 * per-user via SCRUM-663 beta overrides (`health_age_enabled_beta`)
 * OR fleet-wide via the base SSM key (`health_age_enabled`). The
 * backend flag-service merges the base + `_beta` override server-side
 * and emits ONE boolean under the base key, so the FE just reads
 * `health_age_enabled` (mirror of use-cgm-glucose-flag.ts).
 *
 * Default-OFF semantics matching sibling dark-launch flags: while the
 * query is loading OR the backend hasn't registered the key yet, this
 * returns false and every Health Age surface (home tile, detail screen)
 * stays invisible. Never returns true speculatively.
 *
 * Terminology note (Legal): ships as "Health Age" only. Bevel-parity
 * "Biological Age" label is a one-line swap if/when Legal approves.
 * Do NOT rename to Biological Age from the FE.
 *
 * Backend flag helpers:
 *   - cos-backend/src/services/feature-flag.service.ts (isHealthAgeEnabled)
 *   - cos-backend/src/services/beta-flag-overrides.service.ts
 *
 * SSM key: /cos/{stage}/backend/health_age_enabled (+ _beta override).
 */

import { useFeatureFlags } from './use-feature-flags'

const HEALTH_AGE_FLAG = 'health_age_enabled'

export function useHealthAgeFlag(): boolean {
  const { data } = useFeatureFlags()
  return data?.[HEALTH_AGE_FLAG] === true
}
