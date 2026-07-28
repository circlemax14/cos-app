/**
 * Health Summary section palette (COS-452 / SCRUM-591).
 *
 * One source of truth for the accent color of each of Ken's 9 sections.
 * BPS-scoped sections (2, 7) reserve the canonical domain colors — every
 * other section uses a distinct neutral to avoid visual collision with
 * the BPS taxonomy. Change here → every section updates.
 */

export const BPS_DOMAIN_COLORS = {
  bio: '#199C4F',
  psy: '#7B3FE4',
  soc: '#C97600',
} as const;

/**
 * Per-section hero accent for the SummaryCardShell chip / icon / border.
 * Only sections 2 and 7 use BPS-scoped colors (they render sub-cards per
 * domain internally). Others use neutrals that don't collide with the
 * bio/psy/soc palette.
 */
export const HEALTH_SUMMARY_SECTION_ACCENTS = {
  // Section 1 — Intake CTA. Owned by IntakeCtaCard, not consumed here.
  intake: '#2563EB',
  // Section 2 — Biopsychosocial history. Sub-cards use BPS_DOMAIN_COLORS directly.
  bpsHistory: BPS_DOMAIN_COLORS.bio,
  // Section 3 — Current conditions. Slate — avoids collision with Social amber.
  conditions: '#64748B',
  // Section 4 — Medications keyed to conditions. Cyan.
  medications: '#0EA5E9',
  // Section 5 — Lab results keyed to conditions. Teal — avoids collision with Psy purple.
  labs: '#0891B2',
  // Section 6 — Vitals red flags. Red is the signal itself.
  vitals: '#DC2626',
  // Section 7 — Treatments / supports / resources per BPS condition. Sub-cards use BPS domain colors.
  treatments: BPS_DOMAIN_COLORS.bio,
  // Section 8 — Further recommendations. Indigo — distinct from Treatments green.
  recommendations: '#6366F1',
  // Section 9 — Freshness footer. No accent.
} as const;

export type HealthSummarySectionKey = keyof typeof HEALTH_SUMMARY_SECTION_ACCENTS;
