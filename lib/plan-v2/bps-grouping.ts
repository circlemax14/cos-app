/**
 * BPS domain → UnifiedSectionKey grouping helper (COS-475).
 *
 * The BE `RoutineRow.bpsDomain` uses the 4-value enum
 * ('bio' | 'psy' | 'soc' | 'spi') while the FE unified-plan view is
 * shaped around 3 sections (biological / psychological / socialSpiritual).
 * `soc` and `spi` collapse into the same bucket.
 */

import type { BpsDomain } from '@/services/api/types';
import type { UnifiedSectionKey } from '@/services/api/unified-plan';

export const BPS_SECTION_ORDER: readonly UnifiedSectionKey[] = [
  'biological',
  'psychological',
  'socialSpiritual',
];

export function bpsDomainToSectionKey(
  domain: BpsDomain,
): UnifiedSectionKey | null {
  switch (domain) {
    case 'bio':
      return 'biological';
    case 'psy':
      return 'psychological';
    case 'soc':
    case 'spi':
      return 'socialSpiritual';
    default:
      return null;
  }
}

export function sectionKeyToPrimaryDomain(
  key: UnifiedSectionKey,
): BpsDomain {
  switch (key) {
    case 'biological':
      return 'bio';
    case 'psychological':
      return 'psy';
    case 'socialSpiritual':
    default:
      return 'soc';
  }
}

/**
 * Group items by their BPS section. Unknown domains are dropped (never
 * throws). Preserves input order within each bucket.
 */
export function groupByBps<T>(
  items: readonly T[],
  keyFn: (item: T) => BpsDomain | undefined | null,
): Record<UnifiedSectionKey, T[]> {
  const out: Record<UnifiedSectionKey, T[]> = {
    biological: [],
    psychological: [],
    socialSpiritual: [],
  };
  for (const item of items) {
    const domain = keyFn(item);
    if (!domain) continue;
    const key = bpsDomainToSectionKey(domain);
    if (!key) continue;
    out[key].push(item);
  }
  return out;
}
