/**
 * COS-810 — a stable colour per plan, so four cards are four cards.
 *
 * The shelf's cards were structurally identical and differed only in their
 * words, so scanning them was reading them. The prod chooser did not have this
 * problem because it had four hand-designed tiers; plans are composed now, and
 * whatever distinguishes them has to be derived.
 *
 * ─── WHY IT IS ONLY AN ACCENT ────────────────────────────────────────
 *
 * The rail and the icon, never the button. A first pass tinted the call to
 * action too, which meant "Switch to this plan" was green on one card and
 * violet on the next — the primary action changing colour by row is a
 * usability bug wearing a style choice's clothes. One action, one colour.
 *
 * ─── WHY THESE COLOURS ───────────────────────────────────────────────
 *
 * All cool. Green, amber and red are STATUS colours in this app — the
 * wellbeing pill, the adherence bars, the plausibility warnings — so a plan
 * accented green would read as a judgement about the plan rather than a label
 * for it.
 *
 * Keyed off planKey rather than list position, so a plan keeps its colour when
 * an admin adds, hides or reorders another one. A card that changed colour
 * because a neighbour was edited would be worse than no colour at all.
 */

export const PLAN_ACCENTS: readonly string[] = [
  '#0D9488', // teal
  '#0369A1', // deep blue
  '#4F46E5', // indigo
  '#7C3AED', // violet
  '#0891B2', // cyan
  '#4338CA', // dark indigo
  '#9333EA', // purple
  '#0E7490', // dark cyan
] as const;

/**
 * Deterministic: the same key always yields the same colour, in this process
 * and the next. A plain character sum is enough — the set is eight wide and
 * the only requirement is stability, not distribution.
 */
export function planAccent(planKey: string | null | undefined): string {
  if (!planKey) return PLAN_ACCENTS[0];
  let sum = 0;
  for (let i = 0; i < planKey.length; i += 1) sum += planKey.charCodeAt(i);
  return PLAN_ACCENTS[sum % PLAN_ACCENTS.length];
}
