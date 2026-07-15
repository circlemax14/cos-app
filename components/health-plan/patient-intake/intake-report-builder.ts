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
    keys: ['sex_at_birth', 'height_in', 'weight_lb'],
  },
  {
    id: 'conditions-meds',
    title: 'Conditions & medications',
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
    keys: ['mental_health_dx', 'mental_health_treatment', 'coping_strategies'],
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

export function formatAnswer(
  q: IntakeQuestion,
  v: IntakeAnswerValue | undefined,
): string {
  if (isBlank(v)) return '';
  switch (q.type) {
    case 'text':
    case 'number':
      return String(v);
    case 'single':
    case 'scale': {
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
            const rec = item as { label: string; note?: string };
            return rec.note ? `${rec.label} (${rec.note})` : rec.label;
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
  age_bracket: 'Age',
  conditions: 'Conditions',
  medications: 'Medications',
  allergies: 'Allergies',
  surgeries: 'Past surgeries',
  family_history: 'Family history',
  tobacco_use: 'Tobacco use',
  alcohol_use: 'Alcohol use',
  sleep_hours: 'Sleep',
  exercise_minutes_weekly: 'Exercise',
  mental_health_dx: 'Mental health diagnoses',
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

export function buildReport(
  intake: PatientIntakeRecord,
  questions: IntakeQuestion[],
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

    // Drop the group if every row is blank AND no clinical score block
    // is available — otherwise a first-time patient sees six half-empty
    // cards. `rows.length` is always >0 for a group with configured keys,
    // so we have to check row-level `missing` flags.
    const anyRowFilled = rows.some((r) => !r.missing);
    if (!anyRowFilled && (scoreBlocks?.length ?? 0) === 0) continue;

    groups.push({
      id: spec.id,
      title: spec.title,
      icon: spec.icon,
      color: spec.color,
      rows,
      ...(scoreBlocks ? { scoreBlocks } : {}),
    });
  }

  return groups;
}
