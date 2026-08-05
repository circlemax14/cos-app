/**
 * intake-report-builder — pure helper that shapes a PatientIntakeRecord +
 * IntakeQuestion[] into the six clinical Groups the redesigned
 * IntakeReportScreen renders, plus screener score helpers.
 *
 * Zero React / RN imports — shared by the on-screen report AND the PDF/text
 * serializer in ShareIntakeReportSection so both surfaces agree on the
 * clinical structure.
 */
import type {
  IntakeAnswerValue,
  IntakeQuestion,
  PatientIntakeRecord,
} from '@/types/patient-intake';

/**
 * Kill switch for the Vaccines group (COS-480, Phase 1 patient-reported).
 *
 * Belt-and-braces gate: when `false`, the report builder skips the Vaccines
 * GroupSpec entirely so no `vaccines` group ever renders even if the BE keeps
 * serving the `vaccines` IntakeQuestion. The wizard side is gated
 * independently on the BE (question filtered out of GET /v1/patients/me/intake
 * response) — this const lets FE cut the report card without a BE deploy.
 *
 * Default TRUE per locked design decision (silent-drop empty state means the
 * card just doesn't appear for patients who haven't answered).
 */
export const VACCINES_INTAKE_ENABLED = true as const;

/**
 * Kill switch for EHR-hydrated immunizations in the Vaccines card
 * (COS-481, Phase 2 hydration layer).
 *
 * When `true`, IntakeReportScreen calls `useImmunizations()` and passes the
 * resulting Rows to `buildReport(..., { vaccines: ehrRows })`. The Vaccines
 * card then splits into two sub-blocks: "From your health records" (EHR)
 * followed by "You added this" (patient-added intake add_list). When
 * `false`, the query is disabled (no BE round-trip) and the card renders
 * exactly as it did after COS-480 Phase 1 (patient-added only, single
 * un-labeled row block).
 *
 * FLIPPED 2026-07-28 (from `false as const` → `true as const`) — cos-backend
 * SSM `IMMUNIZATIONS_EHR_ENABLED=true` shipped prod earlier today (release-
 * vaccines-flip-hs3a-2026-07-28), so the /v1/patients/me/immunizations
 * endpoint now returns real EHR-hydrated Immunization rows. Same OTA-revert
 * lever contract as every other module-const kill switch in the app.
 * Rollback: revert this commit + OTA (flag flip back to `false as const`
 * takes effect on next app launch). Do NOT promote to `process.env.X ===
 * 'true'` — that pattern silently resolves to false in stages that never
 * set the var and defeats the entire point of the switch.
 */
export const IMMUNIZATIONS_EHR_ENABLED = true as const;

export interface Row {
  key: string;
  label: string;
  value: string;
  missing: boolean;
}

export type ScoreInterpretation =
  | 'positive'
  | 'below-threshold'
  | 'low'
  | 'moderate'
  | 'strong'
  | 'info';

export interface ScoreBlock {
  name: string;
  sum: number;
  max: number;
  label: string;
  interpretation: ScoreInterpretation;
  footnote?: string;
}

export type GroupId =
  | 'demographics'
  | 'conditions-meds'
  | 'vaccines'
  | 'lifestyle'
  | 'mental-health'
  | 'social-support'
  | 'work-finances';

export interface Group {
  id: GroupId;
  title: string;
  icon: string;
  color: string;
  rows: Row[];
  /**
   * COS-481 Phase 2: optional EHR-hydrated rows shown ABOVE `rows` on the
   * report card, under a "From your health records" sub-header. Only
   * populated when the caller passes `ehrRowsByGroup` to `buildReport` AND
   * a matching group id has non-empty rows. Kept optional (`?: undefined`
   * default) so every Phase-1 consumer stays source-compatible — a Group
   * with no `ehrRows` renders exactly like the pre-Phase-2 shape.
   */
  ehrRows?: Row[];
  scoreBlocks?: ScoreBlock[];
}

interface GroupSpec {
  id: GroupId;
  title: string;
  icon: string;
  color: string;
  keys: string[];
}

// Canonical group order. Colors align with the existing BPS palette so no
// new brand tokens are introduced by the report.
const GROUP_SPECS: readonly GroupSpec[] = [
  {
    id: 'demographics',
    title: 'Demographics',
    icon: 'person',
    color: '#0891B2',
    // SCRUM-659 followup (Ken 2026-07-31): add race_ethnicity + blood_type.
    keys: ['sex_at_birth', 'race_ethnicity', 'blood_type', 'height_in', 'weight_lb'],
  },
  {
    id: 'conditions-meds',
    // Ken 2026-07-31 — was "Conditions & medications" → sharpen the
    // medical-vs-mental-health split. Mental-health meds live in the
    // Mental health group below.
    title: 'Medical conditions & medications',
    icon: 'medical-services',
    color: '#199C4F',
    keys: [
      'conditions',
      'medications',
      'allergies',
      'surgeries',
      'family_history',
    ],
  },
  // Vaccines sits between conditions-meds (green) and lifestyle (blue).
  // Teal #0F766E is distinct from the existing six group colors
  // (0891B2, 199C4F, 0EA5E9, 7B3FE4, C97600, 334155). Gated by
  // VACCINES_INTAKE_ENABLED so FE can cut the card without a BE deploy.
  ...(VACCINES_INTAKE_ENABLED
    ? [
        {
          id: 'vaccines' as const,
          title: 'Vaccines',
          icon: 'vaccines',
          color: '#0F766E',
          keys: ['vaccines'],
        },
      ]
    : []),
  {
    id: 'lifestyle',
    title: 'Lifestyle',
    icon: 'directions-run',
    color: '#0EA5E9',
    keys: [
      'tobacco_use',
      'alcohol_use',
      'sleep_hours',
      'exercise_minutes_weekly',
    ],
  },
  {
    id: 'mental-health',
    title: 'Mental health',
    icon: 'psychology',
    color: '#7B3FE4',
    // Screener keys (phq2_*, gad2_*, pss4_*) are intentionally omitted —
    // they surface via scoreBlocks below, not as raw rows.
    // SCRUM-659 followup (Ken 2026-07-31): add mental_health_medications
    // between dx and treatment so the psychotropic list reads as the
    // canonical pair with the diagnoses it links to.
    keys: ['mental_health_dx', 'mental_health_medications', 'mental_health_treatment', 'coping_strategies'],
  },
  {
    id: 'social-support',
    title: 'Social support',
    icon: 'groups',
    color: '#C97600',
    // lsns6_* keys are omitted — they surface via scoreBlock below.
    keys: [
      'living_situation',
      'caregiver_role',
      'help_available',
      'recent_life_events',
      'cultural_faith_notes',
      'advance_directives',
    ],
  },
  {
    id: 'work-finances',
    title: 'Work & finances',
    icon: 'work',
    color: '#334155',
    keys: ['employment', 'financial_comfort'],
  },
];

function isBlank(v: IntakeAnswerValue | undefined): boolean {
  if (v === undefined || v === null || v === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

// Vaccine dates arrive from the wizard as free-text in the add_list `note`
// field. Users may type "2023", "March 2023", "3/15/23", etc. When the string
// parses as a real date we render it as "MMM YYYY" (e.g. "Mar 2023") so the
// doctor-facing report is uniform; otherwise we keep the raw text so we never
// lose what the patient actually said.
const MMM = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatVaccineDateNote(note: string): string {
  const trimmed = note.trim();
  if (!trimmed) return '';
  // Bare 4-digit year — Date.parse('2023') mis-parses on some engines.
  if (/^\d{4}$/.test(trimmed)) return trimmed;
  const t = Date.parse(trimmed);
  if (Number.isNaN(t)) return trimmed;
  const d = new Date(t);
  return `${MMM[d.getMonth()]} ${d.getFullYear()}`;
}

function formatVaccinesAnswer(v: IntakeAnswerValue | undefined): string {
  if (!Array.isArray(v)) return '';
  return v
    .map((item) => {
      if (typeof item === 'string') return item;
      if (typeof item === 'object' && item !== null && 'label' in item) {
        const rec = item as { label: string; note?: string };
        const name = rec.label.trim();
        if (!name) return '';
        const dateText = rec.note ? formatVaccineDateNote(rec.note) : '';
        return dateText ? `${name} (${dateText})` : name;
      }
      return '';
    })
    .filter(Boolean)
    .join(', ');
}

export function formatAnswer(
  q: IntakeQuestion,
  v: IntakeAnswerValue | undefined,
): string {
  if (isBlank(v)) return '';
  // Vaccines is add_list-shaped but renders with a comma-joined "Name (MMM YYYY)"
  // per row instead of the generic " · " / "(note)" pattern — the note field is
  // a date, not a free-form annotation.
  if (q.key === 'vaccines' && q.type === 'add_list') {
    return formatVaccinesAnswer(v);
  }
  switch (q.type) {
    case 'text':
    case 'number':
      return String(v);
    case 'single':
    case 'scale': {
      // SCRUM-659 followup — { choice, specify } shape for
      // race_ethnicity when Multiple/Other is selected. Format as
      // "Multiple ethnicity / Other: Filipino & Vietnamese".
      if (typeof v === 'object' && v !== null && !Array.isArray(v) && 'choice' in v) {
        const wrapped = v as { choice: string; specify?: string };
        const opt = q.options?.find((o) => String(o.value) === String(wrapped.choice));
        const chosenLabel = opt?.label ?? String(wrapped.choice);
        const specify = typeof wrapped.specify === 'string' ? wrapped.specify.trim() : '';
        return specify ? `${chosenLabel}: ${specify}` : chosenLabel;
      }
      const opt = q.options?.find(o => o.value === v);
      return opt ? opt.label : String(v);
    }
    case 'multi': {
      if (!Array.isArray(v)) return '';
      const labels = v.map(
        val => q.options?.find(o => o.value === val)?.label ?? String(val),
      );
      return labels.join(', ');
    }
    case 'add_list': {
      if (!Array.isArray(v)) return '';
      return v
        .map(item => {
          if (typeof item === 'string') return item;
          if (typeof item === 'object' && item !== null && 'label' in item) {
            const rec = item as { label: string; note?: string; linkedIds?: string[] };
            // SCRUM-659 followup — surface linkedIds inline so the
            // report reads "Metformin (500mg) — treats: Type 2 diabetes".
            const linkedText = rec.linkedIds && rec.linkedIds.length > 0
              ? ` — treats: ${rec.linkedIds.join(', ')}`
              : '';
            const head = rec.note ? `${rec.label} (${rec.note})` : rec.label;
            return `${head}${linkedText}`;
          }
          return '';
        })
        .filter(Boolean)
        .join(' · ');
    }
    default:
      return '';
  }
}

function coerceNumber(v: IntakeAnswerValue | undefined): number | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'boolean') return null;
  if (Array.isArray(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function phq2Score(
  answers: Record<string, IntakeAnswerValue>,
): ScoreBlock | null {
  const a = coerceNumber(answers.phq2_1_interest);
  const b = coerceNumber(answers.phq2_2_down);
  if (a === null || b === null) return null;
  const sum = a + b;
  const positive = sum >= 3;
  return {
    name: 'PHQ-2',
    sum,
    max: 6,
    label: positive ? 'Positive screen' : 'Below threshold',
    interpretation: positive ? 'positive' : 'below-threshold',
    footnote: positive
      ? 'Screening tool — not a diagnosis. Discuss with your care team.'
      : undefined,
  };
}

export function gad2Score(
  answers: Record<string, IntakeAnswerValue>,
): ScoreBlock | null {
  const a = coerceNumber(answers.gad2_1_nervous);
  const b = coerceNumber(answers.gad2_2_worry);
  if (a === null || b === null) return null;
  const sum = a + b;
  const positive = sum >= 3;
  return {
    name: 'GAD-2',
    sum,
    max: 6,
    label: positive ? 'Positive screen' : 'Below threshold',
    interpretation: positive ? 'positive' : 'below-threshold',
    footnote: positive
      ? 'Screening tool — not a diagnosis. Discuss with your care team.'
      : undefined,
  };
}

const PSS4_LABELS: readonly string[] = [
  'Never',
  'Almost never',
  'Sometimes',
  'Fairly often',
  'Very often',
];

export function pss4Score(
  answers: Record<string, IntakeAnswerValue>,
): ScoreBlock | null {
  const v = coerceNumber(answers.pss4_1_unable);
  if (v === null) return null;
  const clamped = Math.max(0, Math.min(4, Math.round(v)));
  return {
    name: 'PSS-4 (single item)',
    sum: v,
    max: 4,
    label: PSS4_LABELS[clamped],
    interpretation: 'info',
    footnote: 'Single-item stress read-out.',
  };
}

export function lsns6AbbrevScore(
  answers: Record<string, IntakeAnswerValue>,
): ScoreBlock | null {
  const fam = coerceNumber(answers.lsns6_family_contact);
  const fri = coerceNumber(answers.lsns6_friend_contact);
  if (fam === null || fri === null) return null;
  const sum = fam + fri;
  let interpretation: ScoreInterpretation;
  let label: string;
  if (sum <= 2) {
    interpretation = 'low';
    label = 'Low social support';
  } else if (sum <= 5) {
    interpretation = 'moderate';
    label = 'Moderate social support';
  } else {
    interpretation = 'strong';
    label = 'Strong social support';
  }
  return {
    name: 'LSNS-6 (abbreviated)',
    sum,
    max: 8,
    label,
    interpretation,
    footnote: 'Abbreviated (2 items) — not the full LSNS-6.',
  };
}

// Short clinical labels per question key — replaces the verbatim wizard
// prompt with a doctor-shareable term. If a key isn't listed here we fall
// back to the question prompt so a newly-added intake question still shows
// something sensible until this map is updated.
const CLINICAL_LABEL: Record<string, string> = {
  height_in: 'Height',
  weight_lb: 'Weight',
  sex_at_birth: 'Sex at birth',
  // SCRUM-659 followup (Ken 2026-07-31): demographic additions.
  race_ethnicity: 'Race / ethnicity',
  blood_type: 'Blood type',
  age_bracket: 'Age',
  // Ken 2026-07-31 — sharpened medical vs mental-health split.
  conditions: 'Medical conditions',
  medications: 'Medications',
  allergies: 'Allergies',
  surgeries: 'Past surgeries',
  family_history: 'Family history',
  vaccines: 'Your vaccine list',
  tobacco_use: 'Tobacco use',
  alcohol_use: 'Alcohol use',
  sleep_hours: 'Sleep',
  exercise_minutes_weekly: 'Exercise',
  mental_health_dx: 'Mental health diagnoses',
  mental_health_medications: 'Psychotropic medications',
  treatment: 'Mental health care',
  coping_strategies: 'Coping strategies',
  living: 'Living situation',
  caregiver: 'Caregiver',
  employment: 'Employment',
  financial_comfort: 'Financial comfort',
  help_available: 'Support available',
  recent_life_events: 'Recent life events',
  cultural_faith: 'Cultural / faith preferences',
  advance_directives: 'Advance directives',
  // Screener items still get short labels in case they're shown as rows
  // (they're normally rendered as score blocks, not rows).
  phq2_1_interest: 'PHQ-2 item 1',
  phq2_2_down: 'PHQ-2 item 2',
  gad2_1_nervous: 'GAD-2 item 1',
  gad2_2_worry: 'GAD-2 item 2',
  pss4_1_unable: 'PSS-4 item',
  lsns6_family: 'Family contact (LSNS-6)',
  lsns6_friend: 'Friend contact (LSNS-6)',
};

/**
 * COS-481 Phase 2: caller-supplied EHR-hydrated rows keyed by group id.
 * Currently only `vaccines` is populated by IntakeReportScreen (from the
 * `useImmunizations()` hook), but the map is typed as `Partial<Record<...>>`
 * so future groups (medications, allergies) can layer without another
 * signature change.
 */
export type EhrRowsByGroup = Partial<Record<GroupId, Row[]>>;

export function buildReport(
  intake: PatientIntakeRecord,
  questions: IntakeQuestion[],
  ehrRowsByGroup?: EhrRowsByGroup,
): Group[] {
  const questionByKey = new Map<string, IntakeQuestion>();
  for (const q of questions) questionByKey.set(q.key, q);

  const answers = intake.answers ?? {};

  const groups: Group[] = [];

  for (const spec of GROUP_SPECS) {
    const rows: Row[] = [];
    for (const key of spec.keys) {
      const question = questionByKey.get(key);
      if (!question) continue;
      const raw = answers[key];
      const formatted = formatAnswer(question, raw);
      const missing = formatted === '';
      rows.push({
        key,
        label: CLINICAL_LABEL[key] ?? question.prompt,
        value: missing ? 'Not shared' : formatted,
        missing,
      });
    }

    let scoreBlocks: ScoreBlock[] | undefined;
    if (spec.id === 'mental-health') {
      const blocks = [
        phq2Score(answers),
        gad2Score(answers),
        pss4Score(answers),
      ].filter((b): b is ScoreBlock => b !== null);
      if (blocks.length > 0) scoreBlocks = blocks;
    } else if (spec.id === 'social-support') {
      const lsns = lsns6AbbrevScore(answers);
      if (lsns) scoreBlocks = [lsns];
    }

    const ehrRows = ehrRowsByGroup?.[spec.id];
    const hasEhrRows = (ehrRows?.length ?? 0) > 0;

    // Drop the group if every row is blank AND no clinical score block
    // is available AND no EHR rows are present. Otherwise a first-time
    // patient sees six half-empty cards. `rows.length` is always >0 for
    // a group with configured keys, so we have to check row-level
    // `missing` flags. COS-481 Phase 2: EHR-only vaccines (patient has
    // FHIR immunizations but never answered the vaccines intake question)
    // must retain the card so those records are still visible.
    const anyRowFilled = rows.some((r) => !r.missing);
    if (!anyRowFilled && (scoreBlocks?.length ?? 0) === 0 && !hasEhrRows) continue;

    groups.push({
      id: spec.id,
      title: spec.title,
      icon: spec.icon,
      color: spec.color,
      rows,
      ...(hasEhrRows ? { ehrRows } : {}),
      ...(scoreBlocks ? { scoreBlocks } : {}),
    });
  }

  return groups;
}
