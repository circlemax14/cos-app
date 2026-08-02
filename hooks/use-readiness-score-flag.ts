/**
 * SCRUM-638 — Daily Readiness/Recovery score kill-switch.
 *
 * Reads off the shared `useFeatureFlags` query so it can be flipped
 * per-user via SCRUM-663 beta overrides (`readiness_score_enabled_beta`)
 * OR fleet-wide via the base SSM key (`readiness_score_enabled`).
 *
 * Default-OFF semantics matching the sibling dark-launch flags — while
 * the query is loading OR the backend hasn't registered the key yet,
 * this returns false and the card silently doesn't mount.
 *
 * Session B TODO: register `readiness_score_enabled` in
 * cos-backend/src/services/feature-flag.service.ts DEFAULT_FLAGS +
 * FLAG_DESCRIPTIONS + SSM_DRIVEN_FLAGS + provision the base + _beta SSM
 * keys per reference_beta_flag_overrides. Until then this returns false.
 */

import { useFeatureFlags } from './use-feature-flags'

const READINESS_SCORE_FLAG = 'readiness_score_enabled'

export function useReadinessScoreFlag(): boolean {
  const { data } = useFeatureFlags()
  return data?.[READINESS_SCORE_FLAG] === true
}
