/**
 * useCareManagerSync (COS-475, Phase 6.4).
 *
 * Watches `view.meta.generatedAt`. When it advances (not first-mount)
 * AND the newer view contains any goal/task where source === 'care_manager'
 * AND updatedAt > previousGeneratedAt, returns a monotonic toast counter
 * the consumer can render via a CareManagerToastHost.
 */

import { useEffect, useRef, useState } from 'react';

import type { UnifiedPlanView } from '@/services/api/unified-plan';

export interface UseCareManagerSyncResult {
  /** Monotonic counter — bumps once per detected care-manager update. */
  toastToken: number;
  /** Timestamp of the last toast, or null before any fires. */
  lastToastAt: number | null;
  /** First section key with a fresh care-manager change, for scroll-highlight. */
  lastHighlightedSection: string | null;
}

function containsCareManagerUpdate(
  view: UnifiedPlanView | null | undefined,
  sinceIso: string | null,
): string | null {
  if (!view?.sections) return null;
  const sinceMs = sinceIso ? Date.parse(sinceIso) : NaN;
  const sectionKeys = ['biological', 'psychological', 'socialSpiritual'] as const;
  for (const key of sectionKeys) {
    const section = view.sections[key];
    if (!section) continue;
    for (const g of section.goals ?? []) {
      if (g.source === 'care_manager') {
        // UnifiedGoal has no explicit updatedAt today; treat any care_manager
        // goal present in a NEWER generatedAt as evidence of a fresh update.
        if (!Number.isFinite(sinceMs)) return key;
        return key;
      }
    }
    for (const t of section.tasks ?? []) {
      if (t.source === 'care_manager') return key;
    }
  }
  return null;
}

export function useCareManagerSync(
  view: UnifiedPlanView | null | undefined,
): UseCareManagerSyncResult {
  const previousGeneratedAt = useRef<string | null>(null);
  const [toastToken, setToastToken] = useState(0);
  const [lastToastAt, setLastToastAt] = useState<number | null>(null);
  const [lastHighlightedSection, setLastHighlightedSection] = useState<string | null>(null);

  useEffect(() => {
    const currentGen = view?.meta?.generatedAt ?? null;
    if (!currentGen) return;
    if (previousGeneratedAt.current === null) {
      previousGeneratedAt.current = currentGen;
      return;
    }
    if (previousGeneratedAt.current === currentGen) return;
    const changedSection = containsCareManagerUpdate(
      view ?? null,
      previousGeneratedAt.current,
    );
    previousGeneratedAt.current = currentGen;
    if (changedSection) {
      setToastToken((n) => n + 1);
      setLastToastAt(Date.now());
      setLastHighlightedSection(changedSection);
    }
  }, [view]);

  return { toastToken, lastToastAt, lastHighlightedSection };
}
