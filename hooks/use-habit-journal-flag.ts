/**
 * SCRUM-640 — Habit Journal kill-switch.
 *
 * Reads off the shared `useFeatureFlags` query so it can be flipped
 * per-user via SCRUM-663 beta overrides (`habit_journal_enabled_beta`)
 * OR fleet-wide via the base SSM key (`habit_journal_enabled`).
 *
 * Default-OFF semantics matching sibling dark-launch flags (mirrors
 * use-proactive-nudges-flag.ts): while the query is loading OR the
 * backend hasn't registered the key yet, this returns false and every
 * habit-journal surface (settings row, screen, correlation strip)
 * stays invisible.
 *
 * Backend flag helper: cos-backend/src/services/habit-journal-flag.ts.
 * SSM key: /cos/{stage}/backend/habit_journal_enabled (+ _beta override).
 */

import { useFeatureFlags } from './use-feature-flags'

const HABIT_JOURNAL_FLAG = 'habit_journal_enabled'

export function useHabitJournalFlag(): boolean {
  const { data } = useFeatureFlags()
  return data?.[HABIT_JOURNAL_FLAG] === true
}
