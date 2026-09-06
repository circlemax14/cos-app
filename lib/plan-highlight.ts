/**
 * COS-808 — "Support: Self-directed" becomes a labelled row; anything else
 * stays a plain line.
 *
 * Two of the prod card's four rows are real plan config (assessment count,
 * cadence). The other two — Support, Best for — were hardcoded marketing copy
 * with NO data source anywhere in the plan model, and inventing schema for
 * them would freeze a marketing decision into the database.
 *
 * So an admin authors them in the highlights they already have: put a colon in
 * and it lines up in the table; leave it out and it renders as before. No
 * migration, no new field, and a plan authored before this still looks right.
 *
 * Split on the FIRST colon only, so "Best for: complex care: many specialists"
 * keeps its second colon in the value. A label is capped because an entire
 * sentence before a colon is prose, not a label, and would wreck the column.
 */
export function parseHighlight(raw: string): { label: string | null; value: string } {
  const at = raw.indexOf(':');
  if (at <= 0) return { label: null, value: raw.trim() };
  const label = raw.slice(0, at).trim();
  const value = raw.slice(at + 1).trim();
  if (!label || !value || label.length > 18) return { label: null, value: raw.trim() };
  return { label, value };
}

/**
 * COS-812 — the order the prod chooser's rows came in.
 *
 * Alignment is what made those cards comparable: the same labels, in the same
 * order, in the same column, so the eye runs DOWN the page instead of
 * re-reading each card. Author order cannot give that — two admins writing the
 * same two rows in opposite orders would break it silently.
 *
 * Rows a plan does not have are simply absent rather than rendered as a dash.
 * A mock showing all four always was a wall of em-dashes, because Assessment
 * and Updates are unconfigured on nearly every plan today. The fixed label
 * COLUMN keeps things aligned across cards even when the row counts differ,
 * which is the part that actually mattered.
 */
export const CANONICAL_ROW_ORDER: readonly string[] = [
  'Assessment',
  'Updates',
  'Support',
  'Best for',
] as const;

/** Stable: rows outside the canonical set keep their author order, after it. */
export function sortRows<T extends { label: string }>(rows: T[]): T[] {
  const rank = (l: string): number => {
    const i = CANONICAL_ROW_ORDER.findIndex((c) => c.toLowerCase() === l.toLowerCase());
    return i === -1 ? CANONICAL_ROW_ORDER.length : i;
  };
  return [...rows].sort((a, b) => rank(a.label) - rank(b.label));
}
