/**
 * Plan v2 shared swipe-action error classifier + user-facing copy
 * (COS-475, Phase 6.4 — round 2).
 *
 * Every swipe handler (SwipeableTaskRow.doSkip/doSnooze,
 * SwipeableRoutineRow.doSnooze) used to inline its own error-code
 * dispatch + toast string. That drifted per-row, silently swallowed
 * some codes, and produced misleading "Undo" language for a
 * non-existent un-omit endpoint. Round 2 centralises the mapping so
 * every call site classifies identically and copy stays consistent.
 *
 * Pure functions only — no React, no AsyncStorage. Node --test
 * friendly.
 */
import type { WrappedApiError } from '@/services/api/ai-health-plan';

export type SwipeActionKind = 'skip' | 'snooze' | 'reschedule' | 'complete';

export type SwipeErrorClass =
  | 'feature-disabled'
  | 'occurrence-closed'
  | 'concurrent-write'
  | 'invalid-time'
  | 'unknown';

export interface ClassifiedSwipeError {
  /** Semantic bucket the caller dispatches on. */
  kind: SwipeErrorClass;
  /** Toast copy to render, or `null` if the caller should stay silent. */
  toast: string | null;
  /** Whether the caller should trigger a refetch after showing the toast. */
  refetch: boolean;
  /** Whether the caller should optimistically revert its local state. */
  revert: boolean;
}

export function errorCodeOf(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const c = (err as WrappedApiError).code;
    return typeof c === 'string' ? c : undefined;
  }
  return undefined;
}

/**
 * Central mapping from BE error code → { kind, toast, refetch, revert }.
 *
 * Design notes (round 2 review):
 *  - No "Undo" language anywhere — the BE has no un-omit endpoint, so
 *    promising one would mislead the patient. See PR body for the
 *    follow-up ticket.
 *  - OCCURRENCE_CLOSED is terminal + explanatory + refetch — the row
 *    should disappear from today's list on next load.
 *  - FEATURE_DISABLED short-circuits: the session breaker flips ONCE
 *    and every subsequent row no-ops without a network round-trip. The
 *    per-row toast copy is intentionally understated because the
 *    session banner already carries the primary message.
 *  - OVERRIDE_CONCURRENT_WRITE on the *second* try (after the caller
 *    retried once) tells the patient the care team is actively
 *    editing, and refetches on a 3s delay to let the write settle.
 */
export function classifySwipeError(
  err: unknown,
  action: SwipeActionKind,
  attempt: 1 | 2 = 1,
): ClassifiedSwipeError {
  const code = errorCodeOf(err);
  switch (code) {
    case 'FEATURE_DISABLED':
      return {
        kind: 'feature-disabled',
        toast: 'Editing unavailable',
        refetch: false,
        revert: true,
      };
    case 'OCCURRENCE_CLOSED':
      return {
        kind: 'occurrence-closed',
        toast: 'This item is already closed for today. Refresh to see the latest.',
        refetch: true,
        revert: true,
      };
    case 'OVERRIDE_CONCURRENT_WRITE': {
      if (attempt >= 2) {
        return {
          kind: 'concurrent-write',
          toast: 'Your care team is updating your plan. Try again in a moment.',
          refetch: true, // caller should schedule a 3s-delayed refetch
          revert: true,
        };
      }
      return {
        kind: 'concurrent-write',
        toast: null,
        refetch: false,
        revert: false,
      };
    }
    case 'INVALID_TIME':
      return {
        kind: 'invalid-time',
        toast: 'That time isn’t valid. Try a different time.',
        refetch: false,
        revert: true,
      };
    default:
      return {
        kind: 'unknown',
        toast: fallbackCopy(action),
        refetch: false,
        revert: true,
      };
  }
}

function fallbackCopy(action: SwipeActionKind): string {
  switch (action) {
    case 'skip':
      return 'Couldn’t skip — try again';
    case 'snooze':
      return 'Couldn’t snooze — try again';
    case 'reschedule':
      return 'Couldn’t reschedule — try again';
    case 'complete':
      return 'Couldn’t update — try again';
  }
}

/**
 * Success copy — matches the same "plain confirmation, no Undo" tone
 * as the error strings above. Extracted so the two call sites can't
 * drift.
 */
export const SUCCESS_COPY = {
  skipped: 'Skipped for today',
  snoozed: (newTime: string): string => `Snoozed to ${newTime}`,
} as const;

/** Session-banner copy for the FEATURE_DISABLED breaker. */
export const FEATURE_DISABLED_BANNER =
  'Plan editing is temporarily unavailable — pull to refresh';
