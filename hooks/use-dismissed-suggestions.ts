/**
 * useDismissedSuggestions — thin AsyncStorage wrapper with an in-memory
 * mirror for cheap `isDismissed(id, now)` checks during render.
 *
 * COS-475, Phase 6.4. Round 2: storage keys are per-user; the hook reads
 * the canonical userSub from `useUser()` and runs the one-shot legacy-key
 * migration before the first read for a given sub.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  dismissSuggestion,
  isDismissed as isDismissedPure,
  migrateLegacySuggestionKeys,
  readDismissed,
  readSnoozed,
  snoozeSuggestion,
  type DismissedMap,
  type SnoozedMap,
} from '@/lib/plan-v2/dismissed-suggestions';
import { useUser } from './use-user';

export interface UseDismissedSuggestionsResult {
  dismissed: DismissedMap;
  snoozed: SnoozedMap;
  ready: boolean;
  isDismissed: (id: string, now?: number) => boolean;
  dismiss: (id: string) => void;
  snooze: (id: string, hours: number) => void;
}

export function useDismissedSuggestions(): UseDismissedSuggestionsResult {
  const { data: user } = useUser();
  const userSub = user?.sub ?? '';
  const [dismissed, setDismissed] = useState<DismissedMap>({});
  const [snoozed, setSnoozed] = useState<SnoozedMap>({});
  const [ready, setReady] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    // Hold `ready=false` until we know the userSub. Emitting empty maps
    // as "ready" would race the AI-suggestions derivation and surface
    // dismissed items for a split second on cold start.
    if (!userSub) {
      setReady(false);
      return () => {
        mounted.current = false;
      };
    }
    (async () => {
      await migrateLegacySuggestionKeys(userSub);
      const [d, s] = await Promise.all([readDismissed(userSub), readSnoozed(userSub)]);
      if (!mounted.current) return;
      setDismissed(d);
      setSnoozed(s);
      setReady(true);
    })().catch(() => {
      if (mounted.current) setReady(true);
    });
    return () => {
      mounted.current = false;
    };
  }, [userSub]);

  const isDismissed = useCallback(
    (id: string, now: number = Date.now()) => isDismissedPure(id, now, dismissed, snoozed),
    [dismissed, snoozed],
  );

  const dismiss = useCallback(
    (id: string) => {
      if (!userSub) return;
      const now = Date.now();
      setDismissed((prev) => ({ ...prev, [id]: now }));
      void dismissSuggestion(userSub, id, now);
    },
    [userSub],
  );

  const snooze = useCallback(
    (id: string, hours: number) => {
      if (!userSub) return;
      const now = Date.now();
      const until = now + Math.max(0, hours) * 60 * 60 * 1000;
      setSnoozed((prev) => ({ ...prev, [id]: until }));
      void snoozeSuggestion(userSub, id, hours, now);
    },
    [userSub],
  );

  return { dismissed, snoozed, ready, isDismissed, dismiss, snooze };
}
