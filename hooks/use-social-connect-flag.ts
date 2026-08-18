/**
 * SCRUM-688 — patient-to-patient Social connections banner gate.
 *
 * Reads off the shared `useFeatureFlags` query so it can be flipped per-user
 * via beta overrides (`social_connect_enabled_beta`) OR fleet-wide via the base
 * SSM key (`social_connect_enabled`). The backend merges base + `_beta`
 * server-side and emits ONE boolean under the base key, so this just reads the
 * base name — mirror of use-agency-visits-flag.ts.
 *
 * Default-OFF: while the query is loading, or the backend has not registered
 * the key yet, this returns false and the "Find people" banner stays hidden.
 * Never returns true speculatively — do not swap this for `useIsFeatureFlagEnabled`,
 * which defaults to TRUE while loading and would flash the banner open on every
 * cold start during a dark launch.
 *
 * The banner this gates is only ever an entry point. Every
 * /v1/patients/me/connections route checks the same key server-side
 * (beta-aware) and 404s when off, so a stale flag payload on a client can only
 * hide a banner it was allowed to show. It can never fabricate a working
 * feature.
 *
 * Backend: cos-backend/src/services/social-connect-flag.ts
 * SSM key:  /cos/{stage}/backend/social_connect_enabled (+ _beta override)
 */

import { useFeatureFlags } from './use-feature-flags'

const SOCIAL_CONNECT_FLAG = 'social_connect_enabled'

export function useSocialConnectFlag(): boolean {
  const { data } = useFeatureFlags()
  return data?.[SOCIAL_CONNECT_FLAG] === true
}
