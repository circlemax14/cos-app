/**
 * COS-1130 — how each body system is drawn.
 *
 * `groupTrendsByBodySystem` decides WHICH system a metric belongs to; this
 * decides what that system looks like. They are separate on purpose: the
 * grouping is clinical and is unit-tested against metric codes, and it should
 * not have to change because someone picks a different icon.
 *
 * Kept in lib rather than inline in the screen because the Apple Health
 * carousel and the clinic carousel both render these groups, and two copies of
 * a colour table drift the moment either is touched.
 */

import type { BodySystem } from '@/lib/body-system-grouping'
import type MaterialIcons from '@expo/vector-icons/MaterialIcons'

type IconName = keyof typeof MaterialIcons.glyphMap

interface SystemLook {
  icon: IconName
  /** Header tint. Decorative — nothing on screen may depend on reading it. */
  accent: string
}

/*
 * Icons are literal where one exists (a heart for the heart) and functional
 * where it does not — there is no kidney glyph in Material, so kidneys take
 * the filter icon rather than an unrelated organ. A wrong-organ icon is worse
 * than an abstract one on a screen a patient reads for health information.
 *
 * Accents come from the palette already used by the Health Status cards, so
 * the two screens read as one system rather than two that happen to share a
 * component.
 */
const LOOK: Record<BodySystem, SystemLook> = {
  heart: { icon: 'favorite', accent: '#E11D48' },
  lungs: { icon: 'air', accent: '#0EA5E9' },
  kidneys: { icon: 'filter-alt', accent: '#7C3AED' },
  liver: { icon: 'science', accent: '#B45309' },
  blood: { icon: 'bloodtype', accent: '#BE123C' },
  metabolic: { icon: 'local-fire-department', accent: '#EA580C' },
  immune: { icon: 'shield', accent: '#0F7A4A' },
  nutrition: { icon: 'restaurant', accent: '#65A30D' },
  body: { icon: 'accessibility-new', accent: '#0891B2' },
  activity: { icon: 'directions-run', accent: '#2563EB' },
  sleep: { icon: 'bedtime', accent: '#4F46E5' },
}

/** The trailing "Other" bucket, and anything added to BodySystem later. */
const FALLBACK: SystemLook = { icon: 'insights', accent: '#6B7280' }

export function lookForSystem(system: BodySystem | null | undefined): SystemLook {
  if (!system) return FALLBACK
  return LOOK[system] ?? FALLBACK
}

/**
 * "4 measures" — what the accordion shows while collapsed.
 *
 * The count is the reason to open one group rather than another, so it is the
 * preview rather than, say, the newest reading: a single value would claim to
 * summarise a group that may hold five unrelated metrics.
 */
export function measuresPreview(count: number): string | undefined {
  if (count <= 0) return undefined
  return `${count} measure${count === 1 ? '' : 's'}`
}
