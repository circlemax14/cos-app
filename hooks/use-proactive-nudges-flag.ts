/**
 * SCRUM-641 — Proactive Nudges kill-switch.
 *
 * Reads off the shared `useFeatureFlags` query so it can be flipped
 * per-user via SCRUM-663 beta overrides (`proactive_nudges_enabled_beta`)
 * OR fleet-wide via the base SSM key (`proactive_nudges_enabled`).
 *
 * Default-OFF semantics matching the sibling dark-launch flags — while
 * the query is loading OR the backend hasn't registered the key yet,
 * this returns false and every nudges surface (settings row + screen)
 * stays invisible.
 *
 * Backend flag helper: cos-backend/src/services/proactive-nudges-flag.ts.
 * SSM key: /cos/{stage}/backend/proactive_nudges_enabled (+ _beta override).
 */

import { useFeatureFlags } from './use-feature-flags'

const PROACTIVE_NUDGES_FLAG = 'proactive_nudges_enabled'

export function useProactiveNudgesFlag(): boolean {
  const { data } = useFeatureFlags()
  return data?.[PROACTIVE_NUDGES_FLAG] === true
}
