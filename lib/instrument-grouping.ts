/**
 * Wave 3 (2026-07-28) — helpers for the grouped-checklist stepper flow.
 *
 * Some instruments (Ohio DDC Leisure Interest is the first) ship dozens of
 * `kind: 'multi'` activities pre-bucketed by category via a stable `help`
 * prefix of the form `Category: <name>`. The one-item-per-screen stepper
 * would force the user to tap Next 40+ times to complete these; instead the
 * app renders one screen PER CATEGORY with all activities in that category
 * listed as tri-state checklists.
 *
 * The category grouping is authored on the backend seed (see
 * cos-backend/src/data/system-instruments.ts) so the FE stays a passive
 * consumer — no client-side taxonomy of which activity belongs where.
 *
 * Detection is intentionally strict: an instrument is treated as "grouped"
 * only when EVERY item is `kind: 'multi'` AND every item's `help` starts
 * with the exact prefix. A mixed instrument (some grouped, some not) or a
 * multi-only one without categories falls back to the standard per-item
 * stepper so no existing check-in accidentally switches UX.
 */

import type { InstrumentItem } from '@/services/api/instruments'

/** Stable category-tag prefix in each item's `help` field. */
export const CATEGORY_PREFIX = 'Category: '

/** Extract the category name from an item's `help` — undefined if the item
 *  isn't category-tagged. */
export function categoryOf(item: InstrumentItem): string | undefined {
  const help = item.help
  if (!help || !help.startsWith(CATEGORY_PREFIX)) return undefined
  const name = help.slice(CATEGORY_PREFIX.length).trim()
  return name.length > 0 ? name : undefined
}

/**
 * True when the instrument should render as a grouped checklist:
 * every item is kind='multi' AND every item carries a category tag.
 * Empty item arrays return false (there's nothing to group).
 */
export function isGroupedInstrument(items: InstrumentItem[]): boolean {
  if (!items || items.length === 0) return false
  for (const item of items) {
    if (item.kind !== 'multi') return false
    if (!categoryOf(item)) return false
  }
  return true
}

/**
 * Bucket items by category, preserving BE item order:
 *  - Categories appear in the order they FIRST appear in `items` (so if the
 *    BE emits `[A1, A2, B1, A3, B2]` you get `[{A: [A1,A2,A3]}, {B: [B1,B2]}]`
 *    rather than sorting alphabetically). This lets the seed author control
 *    the pedagogical order without a separate ordering field.
 */
export function groupItemsByCategory(
  items: InstrumentItem[],
): { category: string; items: InstrumentItem[] }[] {
  const buckets = new Map<string, InstrumentItem[]>()
  for (const item of items) {
    const cat = categoryOf(item)
    if (!cat) continue
    const bucket = buckets.get(cat)
    if (bucket) bucket.push(item)
    else buckets.set(cat, [item])
  }
  return Array.from(buckets.entries()).map(([category, catItems]) => ({
    category,
    items: catItems,
  }))
}
