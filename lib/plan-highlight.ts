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
