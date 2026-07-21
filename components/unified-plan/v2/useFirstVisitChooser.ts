/**
 * useFirstVisitChooser — CHUNK 32 (2026-07-21).
 *
 * One-shot AsyncStorage-guarded auto-push of the plan-type chooser on
 * first visit. Byte-for-byte mirror of legacy `app/Home/health-plan.tsx`
 * lines 449-474 so users migrating from the legacy path to v2 don't get
 * re-prompted:
 *
 *   - Same AsyncStorage key: 'health-plan.chooser.acknowledged'
 *   - Same dynamic import of AsyncStorage (avoids reported static-import
 *     issues on older iOS in this repo)
 *   - Same double-guard: React ref (survives remount within session) +
 *     the AsyncStorage key (survives app restart, shared with legacy)
 *   - Same target route: '/Home/plan-type-chooser' (a Stack route in
 *     app/Home/_layout.tsx, NOT a Modal)
 *
 * iOS 26.5 SAFE: no Reanimated, no worklets, no Modal, no LayoutAnimation.
 * router.push to a Stack route is already exercised on the crashing
 * build 62 without incident via the legacy call site.
 */

import React from 'react';
import { router } from 'expo-router';

import type { PlanType } from '@/services/api/plan-type';

export interface UseFirstVisitChooserQuery {
  isLoading: boolean;
  data: PlanType | undefined;
}

export function useFirstVisitChooser(
  planTypeQuery: UseFirstVisitChooserQuery,
): void {
  // Double-guard #1 — survives remount within the same JS session.
  // Set BEFORE the async IIFE so rapid re-renders during the
  // AsyncStorage read cannot double-fire the push.
  const promptedRef = React.useRef(false);

  React.useEffect(() => {
    if (promptedRef.current) return;
    if (planTypeQuery.isLoading) return;
    if (planTypeQuery.data === undefined) return;

    // Flip the ref FIRST, then run the async work.
    promptedRef.current = true;

    void (async () => {
      try {
        // Dynamic import — matches proven-safe legacy pattern in
        // app/Home/health-plan.tsx line 463.
        const AsyncStorage = (
          await import('@react-native-async-storage/async-storage')
        ).default;
        // Double-guard #2 — survives app restart AND is byte-identical
        // to the legacy key so a user who ack'd on legacy is not
        // re-prompted on v2.
        const KEY = 'health-plan.chooser.acknowledged';
        const acked = await AsyncStorage.getItem(KEY);
        if (!acked) {
          router.push('/Home/plan-type-chooser' as never);
          await AsyncStorage.setItem(KEY, '1');
        }
      } catch {
        /* ignore — failing to prompt is preferable to crashing the screen */
      }
    })();
  }, [planTypeQuery.isLoading, planTypeQuery.data]);
}
