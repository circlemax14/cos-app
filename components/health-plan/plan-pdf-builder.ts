/**
 * plan-pdf-builder — pure helper that turns the biopsychosocial Care Plan
 * into the HTML string `SharePlanSection` hands to `expo-print`.
 *
 * Sibling of `patient-intake/intake-report-builder.ts`: ZERO React / RN /
 * axios imports so the whole thing is unit-testable under plain
 * `node --test` (see tests/unit/plan-pdf-builder.test.mjs) with no RN
 * runtime, no jest, and no transform step.
 *
 * WHY A SEPARATE MODULE (rather than an inline `buildHtml` closure like
 * ShareIntakeReportSection has): the intake share component builds its HTML
 * inside the component body, which means the only way to test the markup is
 * to mount the component. The plan PDF carries substantially more shaping
 * logic (cadence phrasing, recurrence phrasing, medication line assembly,
 * "habits"→"Routines" renaming, empty-section suppression) and that logic is
 * exactly the part that regresses silently. Hoisting it to a pure function
 * makes every one of those rules assertable. The RENDERING pipeline
 * (expo-print → expo-sharing → RN Share text fallback) is still byte-for-byte
 * the intake mechanism — see SharePlanSection.tsx.
 *
 * TYPE IMPORTS ARE DELIBERATELY `import type`. Node's type-stripping erases
 * `import type` statements entirely, so the `@/…` path aliases below are
 * never resolved at runtime and the test can import this file directly.
 * DO NOT convert any of these to value imports — `@/services/api/…` pulls in
 * axios + the RN api-client and would break the test harness (and drag RN
 * into a module that has no business touching it).
 */
import type { BiopsychosocialSectionKey } from './SectionCard';
import type {
  BiopsychosocialPlanSections,
  MeasurableGoal,
  SectionPlan,
  SectionStatus,
  SectionTrendDirection,
} from '@/services/api/biopsychosocial-plan';
import type { Medication } from '@/services/api/plan-medications';
import type { PlanHabit, PlanTask } from '@/services/api/types';

/**
 * Non-medical-record disclaimer.
 *
 * Sentence 1 is the shipped intake wording, verbatim except for
 * "self-reported answers" → "care plan" (IntakeReportScreen.tsx:500 /
 * ShareIntakeReportSection.tsx:244). It is load-bearing: a patient may hand
 * this PDF to a clinician, and it must not read as an official record.
 * Sentence 2 is the Apple-1.4.1 AI disclaimer already carried by
 * `components/ai/ai-citations-footer.tsx`, condensed — the plan body is
 * Bedrock-generated, which the intake body is not, so the intake footer alone
 * would under-disclose here.
 *
 * DO NOT soften or shorten this string without Legal sign-off.
 */
export const PLAN_PDF_DISCLAIMER =
  'This is a snapshot of your care plan at the time it was shared. ' +
  'It is not a medical record and may not include everything your care team knows. ' +
  'Parts of this plan are AI-generated and are informational only — not a diagnosis ' +
  'or treatment plan. Always consult your doctor or qualified health professional ' +
  'before making any medical decisions or changing medications.';

/**
 * Section display titles. Intentionally duplicated from
 * `BiopsychosocialPlanScreen.SECTION_ORDER` rather than imported: that
 * module is a .tsx component with RN imports at module scope, so importing
 * a VALUE from it would defeat the pure-module contract above. Keep the two
 * in lockstep — the on-screen card and the PDF must not disagree about what
 * a section is called.
 */
export const PLAN_PDF_SECTION_ORDER: readonly {
  key: BiopsychosocialSectionKey;
  title: string;
  color: string;
}[] = [
  // Colors mirror SectionCard.SECTION_STYLE so the printed section headers
  // carry the same identity as the cards the patient tapped through.
  { key: 'biological', title: 'Biological Wellness', color: '#3B82F6' },
  { key: 'psychological', title: 'Psychological Wellness', color: '#8B5CF6' },
  { key: 'social', title: 'Social & Faith', color: '#F59E0B' },
];

/** Mirrors SectionCard.STATUS_STYLE labels. */
const STATUS_LABEL: Record<SectionStatus, string> = {
  'on-track': 'On track',
  'needs-attention': 'Needs attention',
  'just-started': 'Just started',
};

/**
 * Mirrors SectionCard.TREND_STYLE, but WORD-ONLY — no ↑ / ↓ / → glyphs.
 * Accessibility rule: never signal by symbol/colour alone. A printed page
 * has no screen reader, so an arrow next to a colour swatch is unreadable
 * to a patient with low vision reading a photocopy. The word carries it.
 */
const TREND_LABEL: Record<SectionTrendDirection, string> = {
  improving: 'Improving',
  stable: 'Stable',
  declining: 'Declining',
  unknown: '',
};

const GOAL_PRIORITY_LABEL: Record<MeasurableGoal['priority'], string> = {
  high: 'High priority',
  medium: 'Medium priority',
  low: 'Low priority',
};

const TASK_RECURRENCE_LABEL: Record<PlanTask['recurrence'], string> = {
  daily: 'Every day',
  weekdays: 'Weekdays',
  weekly: 'Weekly',
  once: 'One time',
};

/**
 * SCRUM-659 shipped the plan field as `habits[]`, but the patient-facing
 * copy everywhere on the printed page says "Routines" — the clinician
 * reading this PDF should not have to reconcile two vocabularies with the
 * app. The DATA key stays `habits` (BE contract); only the display string
 * changes. Kept as a named const so the rename is greppable if product
 * ever unifies the vocabulary.
 */
export const ROUTINES_SECTION_TITLE = 'Routines';

const HABIT_DOMAIN_LABEL: Record<PlanHabit['bpsDomain'], string> = {
  bio: 'Biological',
  psycho: 'Psychological',
  social: 'Social',
  spiritual: 'Spiritual',
};

/**
 * HTML-escape a user/LLM-provided string before interpolation.
 *
 * Byte-identical to the `escape` helpers in ShareIntakeReportSection and
 * ShareSummarySection so every patient-facing PDF in the app escapes the
 * same five characters the same way. Exported so the share component never
 * grows a second, drifting copy.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Trim + drop empty/whitespace-only entries from a possibly-absent array. */
function cleanStrings(values: readonly string[] | undefined | null): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean);
}

/**
 * Long-form date, matching ShareIntakeReportSection's header exactly
 * (`{ month: 'long', day: 'numeric', year: 'numeric' }`, device locale).
 * Returns '' for a missing/unparseable value so callers can suppress the
 * whole clause instead of printing "Invalid Date" on a document a patient
 * hands to a doctor.
 */
export function formatLongDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * "Every day" / "Every week" / "Every 3 days" for a PlanHabit cadence.
 *
 * `cadence` is a union of two string literals and an `{ everyNDays }`
 * object (services/api/types.ts). A non-finite or <1 `everyNDays` falls
 * back to 'Daily' rather than printing "Every 0 days" / "Every NaN days" —
 * a nonsense cadence on a clinician-facing page is worse than a
 * conservative default.
 */
export function formatHabitCadence(cadence: PlanHabit['cadence']): string {
  if (cadence === 'daily') return 'Every day';
  if (cadence === 'weekly') return 'Every week';
  if (cadence && typeof cadence === 'object' && 'everyNDays' in cadence) {
    const n = Number(cadence.everyNDays);
    if (!Number.isFinite(n) || n < 1) return 'Every day';
    if (n === 1) return 'Every day';
    return `Every ${Math.round(n)} days`;
  }
  return 'Every day';
}

/** "20 minutes" / "8 glasses" / "" — target + unit, either of which may be absent. */
export function formatHabitTarget(habit: PlanHabit): string {
  const value = habit.targetValue;
  const unit = typeof habit.unit === 'string' ? habit.unit.trim() : '';
  const hasValue = typeof value === 'number' && Number.isFinite(value);
  if (!hasValue && !unit) return '';
  if (!hasValue) return unit;
  return unit ? `${value} ${unit}` : String(value);
}

/**
 * A medication's clinical one-liner: "Metformin 500 mg — twice daily — 8:00, 20:00".
 * Every part after the name is optional; absent parts collapse rather than
 * leaving dangling separators.
 */
export function formatMedicationLine(med: Medication): string {
  const name = typeof med.name === 'string' ? med.name.trim() : '';
  const dose = typeof med.dose === 'string' ? med.dose.trim() : '';
  const head = [name, dose].filter(Boolean).join(' ');
  const frequency = typeof med.frequency === 'string' ? med.frequency.trim() : '';
  const times = cleanStrings(med.times).join(', ');
  return [head, frequency, times].filter(Boolean).join(' — ');
}

/**
 * Filter to the meds a clinician should read as CURRENTLY taken.
 *
 * The share component fetches without `includePast`, so discontinued rows
 * shouldn't arrive at all — this is a defensive second gate. Printing a
 * stopped medication under a heading that says "Current medications" is a
 * clinical-safety problem, not a cosmetic one, so we filter on all three
 * of the additive past-med markers (`discontinuedAt`, `hidden`,
 * `endedInEhr`) rather than trusting the request parameter.
 */
export function selectCurrentMedications(
  medications: readonly Medication[] | undefined | null,
): Medication[] {
  if (!Array.isArray(medications)) return [];
  return medications.filter(
    (m) =>
      !!m &&
      typeof m.name === 'string' &&
      m.name.trim() !== '' &&
      !m.discontinuedAt &&
      m.hidden !== true &&
      m.endedInEhr !== true,
  );
}

/** Everything the printed plan needs. All fields optional → an empty PDF still renders. */
export interface PlanPdfInput {
  /** Patient's display name for the header. Falls back to a generic title. */
  patientName?: string | null;
  /** ISO timestamp the plan itself was generated (BiopsychosocialPlanRecord.generatedAt). */
  planGeneratedAt?: string | null;
  /** When the PDF is being produced. Injectable so tests are deterministic. */
  sharedOn?: Date;
  /** The three biopsychosocial sections. Null/absent → the sections block is omitted. */
  sections?: BiopsychosocialPlanSections | null;
  /** Plan-level AI summary shown above the sections (AiHealthPlan.summary). */
  aiSummary?: string | null;
  /** Tasks already bucketed by section — same mapping the on-screen cards use. */
  tasksBySection?: Partial<Record<BiopsychosocialSectionKey, PlanTask[]>>;
  /** SCRUM-659 plan habits. Printed under the "Routines" heading. */
  habits?: readonly PlanHabit[] | null;
  /** Effective medication list. Filtered through `selectCurrentMedications`. */
  medications?: readonly Medication[] | null;
}

// ── Fragment renderers (all take pre-validated data, all escape) ───────────

function renderBullets(items: readonly string[]): string {
  if (items.length === 0) return '';
  return `<ul>${items.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`;
}

function renderGoals(goals: readonly MeasurableGoal[]): string {
  const usable = goals.filter((g) => !!g && typeof g.title === 'string' && g.title.trim() !== '');
  if (usable.length === 0) return '';
  const rows = usable
    .map((g) => {
      // Priority is paired with its word label, never a colour chip — the
      // printed page has no colour guarantee (greyscale printers, photocopies).
      const meta = [
        GOAL_PRIORITY_LABEL[g.priority] ?? '',
        g.target ? `Target: ${g.target}` : '',
        g.baseline ? `Baseline: ${g.baseline}` : '',
        g.timeframe ? `Timeframe: ${g.timeframe}` : '',
      ]
        .filter(Boolean)
        .map((m) => escapeHtml(m))
        .join(' · ');
      const description =
        typeof g.description === 'string' && g.description.trim()
          ? `<div class="body">${escapeHtml(g.description.trim())}</div>`
          : '';
      return `<li><strong>${escapeHtml(g.title.trim())}</strong>${
        meta ? `<div class="meta">${meta}</div>` : ''
      }${description}</li>`;
    })
    .join('');
  return `<h3>Goals</h3><ul>${rows}</ul>`;
}

function renderTasks(tasks: readonly PlanTask[]): string {
  const usable = tasks.filter((t) => !!t && typeof t.title === 'string' && t.title.trim() !== '');
  if (usable.length === 0) return '';
  const rows = usable
    .map((t) => {
      const meta = [
        TASK_RECURRENCE_LABEL[t.recurrence] ?? '',
        typeof t.scheduledTime === 'string' && t.scheduledTime.trim() ? `at ${t.scheduledTime.trim()}` : '',
      ]
        .filter(Boolean)
        .map((m) => escapeHtml(m))
        .join(' · ');
      const description =
        typeof t.description === 'string' && t.description.trim()
          ? `<div class="body">${escapeHtml(t.description.trim())}</div>`
          : '';
      return `<li><strong>${escapeHtml(t.title.trim())}</strong>${
        meta ? `<div class="meta">${meta}</div>` : ''
      }${description}</li>`;
    })
    .join('');
  return `<h3>Tasks</h3><ul>${rows}</ul>`;
}

function renderSection(
  spec: { key: BiopsychosocialSectionKey; title: string; color: string },
  section: SectionPlan | undefined,
  tasks: readonly PlanTask[],
): string {
  if (!section) return '';
  const bullets = cleanStrings(section.planBullets);
  const goalsHtml = renderGoals(Array.isArray(section.goals) ? section.goals : []);
  const tasksHtml = renderTasks(tasks);
  const trendSummary =
    typeof section.trendSummary === 'string' ? section.trendSummary.trim() : '';

  // Drop a section that would print as a bare heading. Same discipline as
  // intake-report-builder's "don't show six half-empty cards" rule — a
  // clinician skimming this should not have to page past empty headings.
  if (bullets.length === 0 && !goalsHtml && !tasksHtml && !trendSummary) return '';

  const statusLabel = STATUS_LABEL[section.status] ?? '';
  const trendLabel = TREND_LABEL[section.trendDirection] ?? '';
  const statusLine = [statusLabel, trendLabel].filter(Boolean).join(' · ');

  return `
<section>
  <h2 style="color:${spec.color};">${escapeHtml(spec.title)}</h2>
  ${statusLine ? `<div class="meta">${escapeHtml(statusLine)}</div>` : ''}
  ${trendSummary ? `<p class="body">${escapeHtml(trendSummary)}</p>` : ''}
  ${bullets.length > 0 ? `<h3>Summary</h3>${renderBullets(bullets)}` : ''}
  ${goalsHtml}
  ${tasksHtml}
</section>`;
}

function renderRoutines(habits: readonly PlanHabit[]): string {
  const usable = habits.filter(
    (h) => !!h && typeof h.label === 'string' && h.label.trim() !== '',
  );
  if (usable.length === 0) return '';
  const rows = usable
    .map((h) => {
      const meta = [
        formatHabitCadence(h.cadence),
        formatHabitTarget(h),
        HABIT_DOMAIN_LABEL[h.bpsDomain] ?? '',
      ]
        .filter(Boolean)
        .map((m) => escapeHtml(m))
        .join(' · ');
      const rationale =
        typeof h.rationale === 'string' && h.rationale.trim()
          ? `<div class="body">${escapeHtml(h.rationale.trim())}</div>`
          : '';
      return `<li><strong>${escapeHtml(h.label.trim())}</strong>${
        meta ? `<div class="meta">${meta}</div>` : ''
      }${rationale}</li>`;
    })
    .join('');
  return `
<section>
  <h2 style="color:#0B6963;">${escapeHtml(ROUTINES_SECTION_TITLE)}</h2>
  <ul>${rows}</ul>
</section>`;
}

function renderMedications(medications: readonly Medication[]): string {
  const current = selectCurrentMedications(medications);
  if (current.length === 0) return '';
  const rows = current
    .map((m) => {
      // Provenance matters to the clinician reading this: "the patient typed
      // this in" and "this came from the health system" are different claims.
      const provenance =
        m.source === 'ehr' ? 'From your health records' : 'You added this';
      return `<tr>
        <td class="med-name">${escapeHtml(formatMedicationLine(m))}</td>
        <td class="med-source">${escapeHtml(provenance)}</td>
      </tr>`;
    })
    .join('');
  return `
<section>
  <h2 style="color:#199C4F;">Current medications</h2>
  <table>${rows}</table>
  <div class="meta">Tracking only — this list does not change any prescription.</div>
</section>`;
}

/**
 * Turn a plan into the printable HTML document.
 *
 * PURE: no I/O, no Date.now() unless `sharedOn` is omitted, no globals other
 * than `toLocaleDateString`. Same input → same output.
 *
 * @param input Plan data (all fields optional; missing data is omitted, never
 *              rendered as "undefined" or an empty heading).
 * @returns A complete standalone HTML document string for `expo-print`.
 */
export function buildPlanHtml(input: PlanPdfInput): string {
  const name = typeof input.patientName === 'string' ? input.patientName.trim() : '';
  const title = name ? `${name}'s care plan` : 'My care plan';

  const sharedOnLabel = formatLongDate(input.sharedOn ?? new Date());
  const planGeneratedLabel = formatLongDate(input.planGeneratedAt);
  const metaParts = [
    sharedOnLabel ? `Shared ${sharedOnLabel}` : '',
    planGeneratedLabel ? `Plan generated ${planGeneratedLabel}` : '',
    'Circle Support Health',
  ].filter(Boolean);

  const summary = typeof input.aiSummary === 'string' ? input.aiSummary.trim() : '';
  const summaryHtml = summary
    ? `<section><h2 style="color:#0D9488;">Plan summary</h2><p class="body">${escapeHtml(
        summary,
      )}</p></section>`
    : '';

  const sections = input.sections ?? null;
  const sectionsHtml = sections
    ? PLAN_PDF_SECTION_ORDER.map((spec) =>
        renderSection(spec, sections[spec.key], input.tasksBySection?.[spec.key] ?? []),
      ).join('')
    : '';

  const routinesHtml = renderRoutines(Array.isArray(input.habits) ? input.habits : []);
  const medicationsHtml = renderMedications(
    Array.isArray(input.medications) ? input.medications : [],
  );

  const bodyHtml = `${summaryHtml}${sectionsHtml}${routinesHtml}${medicationsHtml}`;
  // A plan with literally nothing in it still has to produce a valid,
  // non-confusing document — the patient tapped Share and expects a file.
  const emptyHtml = bodyHtml
    ? ''
    : '<section><p class="body">Your care plan does not have any content yet.</p></section>';

  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { margin: 0.75in; }
  body { font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #111827; font-size: 12pt; line-height: 1.45; }
  header { border-bottom: 3px solid #199C4F; padding-bottom: 12px; margin-bottom: 20px; }
  header h1 { font-size: 22pt; margin: 0 0 4px 0; color: #111827; }
  header .meta { color: #64748b; font-size: 10pt; }
  section { margin-bottom: 22px; page-break-inside: avoid; }
  section h2 { font-size: 14pt; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin: 0 0 8px 0; }
  section h3 { font-size: 11pt; margin: 12px 0 4px 0; color: #334155; }
  .meta { color: #64748b; font-size: 10pt; margin: 2px 0; }
  .body { margin: 4px 0; }
  ul { padding-left: 20px; margin: 4px 0; }
  li { margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 4px 0; vertical-align: top; }
  .med-name { width: 65%; }
  .med-source { color: #64748b; font-size: 10pt; }
  footer { border-top: 1px solid #e2e8f0; padding-top: 10px; margin-top: 30px; color: #94a3b8; font-size: 9pt; }
</style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">${escapeHtml(metaParts.join(' · '))}</div>
  </header>
  ${bodyHtml}${emptyHtml}
  <footer>
    ${escapeHtml(PLAN_PDF_DISCLAIMER)}
  </footer>
</body>
</html>`;
}

/**
 * Strip a built HTML document down to plain text.
 *
 * Byte-identical to the helper in ShareIntakeReportSection so the RN
 * `Share.share` fallback (older binaries without expo-print / expo-sharing
 * linked) degrades the same way on both surfaces. Lives here rather than in
 * the component so the test can assert the disclaimer survives the
 * degradation — a text-only share must still carry it.
 */
export function planHtmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
