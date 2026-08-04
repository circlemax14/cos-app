/**
 * SCRUM-648 — CGM / Glucose (TIR) kill-switch.
 *
 * Reads off the shared `useFeatureFlags` query so it can be flipped
 * per-user via SCRUM-663 beta overrides (`cgm_glucose_enabled_beta`)
 * OR fleet-wide via the base SSM key (`cgm_glucose_enabled`). The
 * backend flag-service merges the base + `_beta` override server-side
 * and emits ONE boolean under the base key, so the FE just reads
 * `cgm_glucose_enabled` (mirror of use-habit-journal-flag.ts).
 *
 * Default-OFF semantics matching sibling dark-launch flags: while the
 * query is loading OR the backend hasn't registered the key yet, this
 * returns false and every CGM surface (Biological tile, glucose screen)
 * stays invisible. Never returns true speculatively.
 *
 * Backend flag helpers:
 *   - cos-backend/src/services/feature-flag.service.ts (isCgmGlucoseEnabled)
 *   - cos-backend/src/services/beta-flag-overrides.service.ts
 *
 * SSM key: /cos/{stage}/backend/cgm_glucose_enabled (+ _beta override).
 */

import { useFeatureFlags } from './use-feature-flags'

const CGM_GLUCOSE_FLAG = 'cgm_glucose_enabled'

export function useCgmGlucoseFlag(): boolean {
  const { data } = useFeatureFlags()
  return data?.[CGM_GLUCOSE_FLAG] === true
}
