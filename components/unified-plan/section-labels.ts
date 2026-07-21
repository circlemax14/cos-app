/**
 * Section presentation constants for the unified BPS plan (COS-467).
 *
 * Kept as pure data (no React, no MaterialIcons import at top-level to
 * keep tests + node:test consumers happy) so `lib/unified-plan-
 * assessment-routing.ts` and `tests/unit/unified-plan-*.test.ts` can
 * import the labels + assessment slugs without pulling in the RN
 * component tree.
 *
 * NOTE ON DUPLICATION vs. `components/health-plan/SectionCard.tsx`
 * `SECTION_STYLE` (exported): that constant keys on the legacy 8-category
 * Care Plan taxonomy (`sleep`, `nutrition`, `movement`, `substance`, …)
 * — a totally different key set from the 3 BPS sections here. The colors
 * on the `biological` / `psychological` / `socialSpiritual` accents are
 * intentionally mirrored so the two views feel like the same product,
 * but the tables themselves are NOT unifiable — a shared table would
 * either force one taxonomy on the other or need a lookup that adds
 * more indirection than the ~30 lines it would save. Keep them separate;
 * change the accents in both when Ken adjusts the palette.
 */

import type { UnifiedSectionKey } from '@/services/api/unified-plan';

// Re-export so callers (BpsAccordion, wellbeing-map, PlanScreenV2, etc.)
// have a single import path for the BPS section-key type + the helpers +
// the order constant. Chunk 28.
export type { UnifiedSectionKey };

export interface UnifiedSectionMeta {
  /** MaterialIcons glyph name — string keeps this file RN-agnostic. */
  icon: string;
  /** Accent hex — matches health-plan/SectionCard SECTION_STYLE for parity. */
  color: string;
  /** Header title shown on the card. */
  title: string;
  /** Short label used in empty-state deep-links: "Take the {label} assessment". */
  shortLabel: string;
}

export const UNIFIED_SECTION_META: Record<UnifiedSectionKey, UnifiedSectionMeta> = {
  biological: {
    icon: 'favorite',
    color: '#3B82F6',
    title: 'Biological',
    shortLabel: 'biological',
  },
  psychological: {
    icon: 'psychology',
    color: '#8B5CF6',
    title: 'Psychological',
    shortLabel: 'psychological',
  },
  socialSpiritual: {
    icon: 'groups',
    color: '#F59E0B',
    title: 'Social & Faith',
    shortLabel: 'social & faith',
  },
};

/** Canonical order matches Ken's approved BPS ordering (bio → psy → soc). */
export const UNIFIED_SECTION_ORDER: readonly UnifiedSectionKey[] = [
  'biological',
  'psychological',
  'socialSpiritual',
];

/**
 * Chunk 28 (2026-07-21): unified-plan `UnifiedSectionKey` → wellbeing-map
 * `BpsDomain` translation. The wellbeing-map screen's internal
 * `BpsDomain` uses the shorter key `'social'` (not `'socialSpiritual'`),
 * and this file is the SINGLE source of truth for that rename hop —
 * do NOT inline the mapping in BpsAccordion, PlanScreenV2, or the
 * wellbeing-map route. Any future `UnifiedSectionKey` addition will
 * fail to compile here via the `satisfies never` exhaustive branch,
 * so the drift shows up at build time instead of as a silent no-op.
 */
export function unifiedSectionToWellbeingMapDomain(
  section: UnifiedSectionKey,
): 'biological' | 'psychological' | 'social' {
  switch (section) {
    case 'biological':
      return 'biological';
    case 'psychological':
      return 'psychological';
    case 'socialSpiritual':
      return 'social';
    default: {
      // Exhaustiveness check — a future UnifiedSectionKey addition
      // makes this line a compile error.
      const _exhaustive: never = section;
      return _exhaustive;
    }
  }
}
