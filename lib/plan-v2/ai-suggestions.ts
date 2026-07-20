/**
 * Client-derived AI suggestion strip (COS-475, Phase 6.4).
 *
 * Pure derivation — inspects `view.sections[*].planBullets` and emits a
 * suggestion for every bullet that does NOT match an existing goal /
 * task / routine title (case-insensitive substring + levenshtein <= 3).
 * Skips ids that are dismissed within the 7d TTL or actively snoozed.
 *
 * NO RN / axios / @/ imports — must remain dependency-free so
 * `node --test` can execute the tests directly. Type mirrors are used
 * locally instead of importing from services/api/unified-plan (which
 * pulls axios into the module graph).
 */

// ── Local type mirrors — DO NOT REPLACE with `@/services/*` imports.
//    Adding those would pull axios/RN into node --test runs.

export type UnifiedSectionKey =
  | 'biological'
  | 'psychological'
  | 'socialSpiritual';

export const BPS_SECTION_ORDER: readonly UnifiedSectionKey[] = [
  'biological',
  'psychological',
  'socialSpiritual',
];

interface Titled {
  title?: string;
}

interface SuggestionSectionShape {
  planBullets?: string[];
  goals?: Titled[];
  tasks?: Titled[];
}

interface SuggestionViewShape {
  sections?: Partial<Record<UnifiedSectionKey, SuggestionSectionShape | undefined>>;
}

export type DismissedMap = Record<string, number>;
export type SnoozedMap = Record<string, number>;

// ── Local isDismissed predicate — mirror of dismissed-suggestions.ts so
//    this file has zero cross-module deps. Behaviour identical.

const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function isDismissed(
  id: string,
  now: number,
  dismissed: DismissedMap | null | undefined,
  snoozed: SnoozedMap | null | undefined,
): boolean {
  if (dismissed) {
    const raw = dismissed[id];
    if (typeof raw === 'number' && raw > 0 && now - raw < DISMISS_TTL_MS) return true;
  }
  if (snoozed) {
    const until = snoozed[id];
    if (typeof until === 'number' && until > now) return true;
  }
  return false;
}

export interface AISuggestion {
  id: string;
  title: string;
  sectionKey: UnifiedSectionKey;
  bulletIndex: number;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/** Iterative Levenshtein — small strings, fine to allocate a matrix. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

function bulletId(sectionKey: UnifiedSectionKey, index: number, bullet: string): string {
  const slug = normalize(bullet).replace(/\W+/g, '-').slice(0, 40);
  return `sug:${sectionKey}:${index}:${slug}`;
}

interface DeriveContext {
  routineTitles?: readonly string[];
}

function bulletCovered(bullet: string, existing: readonly string[]): boolean {
  const nb = normalize(bullet);
  if (!nb) return true;
  for (const raw of existing) {
    if (!raw) continue;
    const nt = normalize(raw);
    if (!nt) continue;
    if (nt.includes(nb) || nb.includes(nt)) return true;
    if (Math.abs(nt.length - nb.length) <= 3 && levenshtein(nt, nb) <= 3) return true;
  }
  return false;
}

export function deriveSuggestions(
  view: SuggestionViewShape | null | undefined,
  dismissed: DismissedMap | null | undefined,
  snoozed: SnoozedMap | null | undefined,
  now: number,
  ctx: DeriveContext = {},
): AISuggestion[] {
  if (!view) return [];
  const out: AISuggestion[] = [];
  for (const sectionKey of BPS_SECTION_ORDER) {
    const section = view.sections?.[sectionKey];
    if (!section) continue;
    const bullets = Array.isArray(section.planBullets) ? section.planBullets : [];
    const goalTitles = (section.goals ?? []).map((g) => g.title ?? '');
    const taskTitles = (section.tasks ?? []).map((t) => t.title ?? '');
    const existing: string[] = [...goalTitles, ...taskTitles, ...(ctx.routineTitles ?? [])];
    bullets.forEach((bullet, index) => {
      if (!bullet || !bullet.trim()) return;
      if (bulletCovered(bullet, existing)) return;
      const id = bulletId(sectionKey, index, bullet);
      if (isDismissed(id, now, dismissed, snoozed)) return;
      out.push({ id, title: bullet, sectionKey, bulletIndex: index });
    });
  }
  return out;
}
