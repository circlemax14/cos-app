/**
 * Shared time-formatting helpers for the unified BPS plan view (COS-467).
 *
 * Extracted so `app/Home/unified-plan.tsx` (header meta-strip) and
 * `components/unified-plan/UnifiedSectionCard.tsx` (per-section "Updated…"
 * label) share the exact same rendering — one place to change the wording,
 * one place to add localization / relative-time backends later.
 */

/**
 * Best-effort relative time — avoids a new dep for one label.
 *
 * Contract:
 *   - `null` / non-ISO / non-finite / empty → `''` (caller decides whether
 *     to render the label at all).
 *   - `< 1 min` → `'just now'`.
 *   - `< 60 min` → `'{n} min ago'`.
 *   - `< 24 hr` → `'{n} hr ago'`.
 *   - `< 7 day` → `'{n} day(s) ago'`.
 *   - Otherwise → localized `MMM d` (e.g. `'Jul 17'`).
 */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffMs = Date.now() - then;
  const min = Math.round(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
