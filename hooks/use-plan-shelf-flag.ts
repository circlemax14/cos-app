/**
 * COS-784 — plan shelf kill-switch.
 *
 * Reads off the shared `useFeatureFlags` query so it can be flipped per-user
 * via beta overrides (`plan_shelf_enabled_beta`) OR fleet-wide via the base SSM
 * key (`plan_shelf_enabled`). The backend merges base + `_beta` server-side and
 * emits ONE boolean under the base key, so this reads the base name — mirror of
 * use-agency-visits-flag.ts.
 *
 * Default-OFF: while the query is loading, or the backend has not registered
 * the key yet, this returns false and neither the Profile row nor the Home tile
 * appears. Do NOT swap this for `useIsFeatureFlagEnabled`, which defaults to
 * TRUE while loading — that would flash a pricing surface open on every cold
 * start during a dark launch, which is the one place a flicker is unacceptable.
 *
 * Unlike the agency-visits flag this gates a screen the server does NOT also
 * check: `/v1/patients/me/plans` is a plain authenticated read with no flag of
 * its own. That is deliberate and safe — the endpoint discloses nothing beyond
 * the plans a patient is already allowed to see (`isVisibleTo` runs regardless)
 * — but it does mean this flag controls VISIBILITY ONLY. It is a rollout
 * control, not a security boundary, and must never be treated as one.
 *
 * SSM key: /cos/{stage}/backend/plan_shelf_enabled (+ _beta override)
 */

import { useFeatureFlags } from './use-feature-flags';

const PLAN_SHELF_FLAG = 'plan_shelf_enabled';

export function usePlanShelfFlag(): boolean {
  const { data } = useFeatureFlags();
  return data?.[PLAN_SHELF_FLAG] === true;
}
