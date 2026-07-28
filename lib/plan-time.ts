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

/**
 * COS-475b CHUNK 18 — stale-plan color escalation for the freshness pill.
 *
 * Pure classifier over `data.meta.generatedAt`. Called synchronously from a
 * `useMemo` in `PlanScreenV2` keyed on the same timestamp — deliberately no
 * `setInterval` / `AppState` subscription (both are on the iOS 26.5 forbidden
 * list per the crash rules). Consequence: a plan that ages past a threshold
 * while the screen sits open will keep its previous color until the next
 * refetch (pull-to-refresh or react-query auto-refetch) flips
 * `data.meta.generatedAt` and re-invalidates the caller's memo. This is
 * intentional — do NOT "fix" by adding a timer.
 *
 * Thresholds (delta = Date.now() − Date.parse(iso)):
 *   - fresh:  delta < 6h
 *   - aging:  delta < 24h
 *   - stale:  otherwise
 *
 * INVARIANT (do not regress): missing, null, unparseable, or future
 * (`delta < 0`, e.g. device-clock skew) timestamps map to `'aging'`,
 * NEVER `'fresh'`. Rendering a green trust signal for absent/malformed
 * metadata would be actively misleading to a clinician.
 */
export type StalenessLevel = 'fresh' | 'aging' | 'stale';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function stalenessLevel(iso: string | null | undefined): StalenessLevel {
  if (iso == null) return 'aging';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return 'aging';
  const delta = Date.now() - parsed;
  if (delta < 0) return 'aging';
  if (delta < SIX_HOURS_MS) return 'fresh';
  if (delta < ONE_DAY_MS) return 'aging';
  return 'stale';
}

/**
 * COS-475b CHUNK 18 — single source of truth for the freshness pill palette.
 *
 * Consumed by `PlanScreenV2` so the pill's dot and label share one hex per
 * (level, scheme) pair. `'fresh'` intentionally maps to the existing subtext
 * hex from `constants/theme.ts` (light `#687076` / dark `#9BA1A6`) so a fresh
 * plan reads identically to the pre-chunk-18 pill — no visual regression on
 * the happy path.
 *
 * Aging/stale hex chosen for legibility on the pill's own tinted background:
 *   - aging: amber-700 light / amber-500 dark
 *   - stale: red-700 light / red-400 dark
 * Dark-mode contrast verified against the pill background, not the screen
 * background — swap toward amber-400 / red-300 in a follow-up OTA if Ken
 * flags legibility on his device.
 */
export const FRESHNESS_COLORS: Record<StalenessLevel, { light: string; dark: string }> = {
  fresh: { light: '#687076', dark: '#9BA1A6' },
  aging: { light: '#B45309', dark: '#F59E0B' },
  stale: { light: '#B91C1C', dark: '#F87171' },
};
