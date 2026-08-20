/**
 * COS-734 — deciding whether to trust the server's plan-type card copy.
 *
 * Pure, and separate from services/plan-type-cards.ts, because that module
 * imports the api-client which drags in Expo config — untestable under
 * `node --test`. The logic that matters lives here; the service is a transport.
 *
 * ─── WHY THIS IS STRICT ──────────────────────────────────────────────
 *
 * This copy sits on the screen where a patient chooses their assessment
 * intensity, and that choice drives real clinical behaviour: screener depth and
 * assessment expiry (cos-backend assessments.service.ts:492).
 *
 * The failure mode to guard is not stale copy — it is a PARTIAL list. Three
 * options where there should be four is invisible: the patient picks the
 * closest, never learns a fourth existed, nothing errors, and the wrong
 * clinical intensity becomes their setting. So anything short or contaminated
 * falls back wholesale rather than rendering what happened to arrive.
 *
 * `type` and `assessmentLevel` are clinical and re-checked here even though the
 * backend already refuses to let a stored row alter them. Two independent
 * checks, because the consequence — a patient silently moved onto different
 * screener logic — surfaces as no error at all.
 */

export type AssessmentLevel = 'light' | 'standard' | 'clinical';

export interface PlanTypeCardCopy {
  type: string;
  title: string;
  description: string;
  assessmentLevel: AssessmentLevel;
  icon: string;
  features: {
    assessment: string;
    updates: string;
    support: string;
    bestFor: string;
  };
}

function isNonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Accept a card only if every field the UI renders is present and non-empty.
 *
 * A partially-populated card would render with blank lines, which looks like a
 * bug in the app rather than missing content — and the server already
 * guarantees completeness, so anything incomplete here means something went
 * wrong in transit and should be ignored in favour of the embedded copy.
 */
function isValidCard(v: unknown, allowedTypes: ReadonlySet<string>): v is PlanTypeCardCopy {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  if (!isNonEmpty(c.type) || !allowedTypes.has(c.type)) return false;
  if (!isNonEmpty(c.title) || !isNonEmpty(c.description) || !isNonEmpty(c.icon)) return false;
  if (c.assessmentLevel !== 'light' && c.assessmentLevel !== 'standard' && c.assessmentLevel !== 'clinical') {
    return false;
  }
  const f = c.features;
  if (!f || typeof f !== 'object') return false;
  const ff = f as Record<string, unknown>;
  return (
    isNonEmpty(ff.assessment) && isNonEmpty(ff.updates) && isNonEmpty(ff.support) && isNonEmpty(ff.bestFor)
  );
}

/**
 * Choose between a server response and the embedded copy. PURE — every branch
 * is reachable from a test without a network or Expo config.
 *
 * A PARTIAL list is the case worth being strict about. Three options where
 * there should be four is invisible to the patient: they pick the closest and
 * never learn a fourth existed, no error is raised, and the wrong clinical
 * intensity becomes their setting. So a short or contaminated list falls back
 * wholesale rather than rendering what happened to arrive.
 */
export function selectCards<T extends { type: string }>(
  raw: unknown,
  embedded: readonly T[],
): PlanTypeCardCopy[] | readonly T[] {
  if (!Array.isArray(raw)) return embedded;
  const allowed = new Set(embedded.map((c) => c.type));
  const cards = raw.filter((c): c is PlanTypeCardCopy => isValidCard(c, allowed));

  // Compare the SET of types, not just the count. A response of
  // [basic, basic] has the right length and the wrong content — it would render
  // two identical cards and silently drop a choice, which is the same invisible
  // failure a short list causes.
  const seen = new Set(cards.map((c) => c.type));
  if (seen.size !== allowed.size) return embedded;

  // Preserve the embedded ORDER. The ladder is meaningful and a server-side
  // Scan has no guaranteed order.
  const byType = new Map(cards.map((c) => [c.type, c]));
  return embedded.map((e) => byType.get(e.type)!);
}

