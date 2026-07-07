import { useFeatureFlags } from './use-feature-flags'

/**
 * Assessment Strategy v2 (COS-360 / SCRUM-518) client kill-switches.
 *
 * Reads off the shared `useFeatureFlags` query (`GET /v1/feature-flags`)
 * rather than `useIsFeatureFlagEnabled`, because that helper defaults
 * missing/loading flags to `true` (correct for the existing sign-in-method
 * toggles, which fail open) — these are dark-launch flags that must default
 * to OFF (per the design doc, both are OFF by default) while the flags
 * query is loading or the backend hasn't shipped the key yet.
 */
const ASSESSMENT_STRATEGY_V2_FLAG = 'assessment_strategy_v2_enabled'
const BIOPSYCHOSOCIAL_PLAN_FLAG = 'biopsychosocial_plan_enabled'

/** Phase 2 — domain-tagged instrument catalog + Family tier groundwork. */
export function useAssessmentStrategyV2Flag(): boolean {
  const { data } = useFeatureFlags()
  return data?.[ASSESSMENT_STRATEGY_V2_FLAG] === true
}

/**
 * Phase 3 — the biopsychosocial (3-section) Care Plan rebuild. Per the design
 * doc, `BIOPSYCHOSOCIAL_PLAN_ENABLED` "requires ASSESSMENT_STRATEGY_V2_ENABLED
 * upstream" — mirrored here so the client can't render the Phase 3 screen
 * off Phase 2 data that was never tagged.
 */
export function useBiopsychosocialPlanFlag(): boolean {
  const { data } = useFeatureFlags()
  const v2Enabled = data?.[ASSESSMENT_STRATEGY_V2_FLAG] === true
  const biopsychosocialEnabled = data?.[BIOPSYCHOSOCIAL_PLAN_FLAG] === true
  return v2Enabled && biopsychosocialEnabled
}
