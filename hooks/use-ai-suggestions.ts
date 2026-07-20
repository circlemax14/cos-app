/**
 * useAISuggestions (COS-475, Phase 6.4).
 *
 * Client-derived suggestions computed from the unified plan view's
 * planBullets vs. existing goal/task/routine titles. Memoized on
 * `view.meta.generatedAt` so the derivation re-runs only when the BE
 * actually delivers a newer view.
 */

import { useCallback, useMemo } from 'react';

import { deriveSuggestions, type AISuggestion } from '@/lib/plan-v2/ai-suggestions';
import type { UnifiedPlanView } from '@/services/api/unified-plan';

import { useDismissedSuggestions } from './use-dismissed-suggestions';

export interface UseAISuggestionsResult {
  items: AISuggestion[];
  ready: boolean;
  dismiss: (id: string) => void;
  snooze: (id: string, hours?: number) => void;
  dismissAll: () => void;
}

const DEFAULT_SNOOZE_HOURS = 7 * 24; // 1 week

export function useAISuggestions(
  view: UnifiedPlanView | null | undefined,
  opts: { routineTitles?: readonly string[] } = {},
): UseAISuggestionsResult {
  const { dismissed, snoozed, ready, dismiss, snooze } = useDismissedSuggestions();

  // Memoize on generatedAt + dismissedMap identity + snoozedMap identity +
  // routine title list identity. Skip a full recompute on every render.
  const items = useMemo<AISuggestion[]>(() => {
    if (!ready) return [];
    return deriveSuggestions(view, dismissed, snoozed, Date.now(), {
      routineTitles: opts.routineTitles,
    });
  }, [view, dismissed, snoozed, ready, opts.routineTitles]);

  const dismissAll = useCallback(() => {
    for (const it of items) snooze(it.id, DEFAULT_SNOOZE_HOURS);
  }, [items, snooze]);

  const snoozeWithDefault = useCallback(
    (id: string, hours: number = DEFAULT_SNOOZE_HOURS) => snooze(id, hours),
    [snooze],
  );

  return { items, ready, dismiss, snooze: snoozeWithDefault, dismissAll };
}
