/**
 * COS-797 — may this patient change their own plan?
 *
 * Reads the shared useFeatureFlags query, mirroring use-plan-shelf-flag.ts.
 *
 * Default-OFF while loading and on error. Unlike the shelf flag, which only
 * controls VISIBILITY, this one is also a permission: the backing route 404s
 * when the flag is off server-side. So a stale app can only ever show a button
 * that politely fails — it can never hand someone a plan.
 */

import { useFeatureFlags } from './use-feature-flags';

const PLAN_SELF_SWITCH_FLAG = 'plan_self_switch_enabled';

export function usePlanSelfSwitchFlag(): boolean {
  const { data } = useFeatureFlags();
  return data?.[PLAN_SELF_SWITCH_FLAG] === true;
}
