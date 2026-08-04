/**
 * SCRUM-644 — Daily Read kill-switch (backend-driven).
 *
 * Reads off the shared `useFeatureFlags` query so it can be flipped
 * per-user via SCRUM-663 beta overrides (`daily_read_enabled_beta`)
 * OR fleet-wide via the base SSM key (`daily_read_enabled`). The
 * backend flag-service merges the base + `_beta` override server-side
 * and emits ONE boolean under the base key, so the FE just reads
 * `daily_read_enabled` (mirror of use-health-age-flag.ts).
 *
 * Default-OFF semantics matching sibling dark-launch flags: while the
 * query is loading OR the backend hasn't registered the key yet, this
 * returns false and every Daily Read surface (home card, downstream
 * hooks) stays invisible / inert. Never returns true speculatively.
 *
 * Backend flag helpers:
 *   - cos-backend/src/services/home-daily-read/flag.ts
 *   - cos-backend/src/services/feature-flag.service.ts
 *
 * SSM key: /cos/{stage}/backend/daily_read_enabled (+ _beta override).
 */

import { useFeatureFlags } from './use-feature-flags'

const DAILY_READ_FLAG = 'daily_read_enabled'

export function useDailyReadFlag(): boolean {
  const { data } = useFeatureFlags()
  return data?.[DAILY_READ_FLAG] === true
}
