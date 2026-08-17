/**
 * SCRUM-688 — agency visits kill-switch.
 *
 * Reads off the shared `useFeatureFlags` query so it can be flipped per-user
 * via beta overrides (`agency_visits_enabled_beta`) OR fleet-wide via the base
 * SSM key (`agency_visits_enabled`). The backend merges base + `_beta`
 * server-side and emits ONE boolean under the base key, so this just reads the
 * base name — mirror of use-health-age-flag.ts.
 *
 * Default-OFF: while the query is loading, or the backend has not registered
 * the key yet, this returns false and the visits panel stays invisible. Never
 * returns true speculatively — do not swap this for `useIsFeatureFlagEnabled`,
 * which defaults to TRUE while loading and would flash the panel open on every
 * cold start during a dark launch.
 *
 * The panel this gates is only ever a hint. `GET /v1/agencies/:id/visits`
 * checks the same key server-side and 404s when off, so a stale flag payload
 * on a client can only hide a panel it was allowed to show. It can never
 * fabricate one.
 *
 * Backend: cos-backend/src/services/agency-visits-flag.ts
 * SSM key:  /cos/{stage}/backend/agency_visits_enabled (+ _beta override)
 */

import { useFeatureFlags } from './use-feature-flags'

const AGENCY_VISITS_FLAG = 'agency_visits_enabled'

export function useAgencyVisitsFlag(): boolean {
  const { data } = useFeatureFlags()
  return data?.[AGENCY_VISITS_FLAG] === true
}
