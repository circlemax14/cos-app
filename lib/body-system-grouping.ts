/**
 * Grouping clinic labs and Apple Health metrics by body system / organ —
 * Ken 2026-08-14: "These I'd like to group by body system/organ."
 *
 * ─── WHERE THIS TAXONOMY CAME FROM ───────────────────────────────────
 *
 * Ken referred to a doc with his categories. It was never located, and no
 * body-system taxonomy existed anywhere in either repo, so the groups below
 * are a conventional clinical panel grouping rather than his. Every
 * assignment is a single table entry: when his doc surfaces, reconciling it
 * is a data edit here, not a rewrite. The two judgement calls most likely to
 * differ from his are marked JUDGEMENT below.
 *
 * ─── WHY MATCHING IS NOT JUST A CODE LOOKUP ──────────────────────────
 *
 * Three different code namespaces reach this screen:
 *
 *   1. `hk-*`      — Apple Health. 17 codes, fixed, defined in services/health.ts.
 *   2. LOINC       — FHIR labs/vitals. A fixed tracked list in the backend's
 *                    trend-computation.service.ts, plus the health-age codes.
 *   3. `report-*`  — derived in hooks/use-report-trends.ts by SLUGIFYING THE
 *                    ANALYTE NAME off an OCR'd lab report. Unbounded: whatever
 *                    the lab happened to print.
 *
 * (3) is why there is a name-matching pass. A code table alone would drop
 * every report-derived analyte into "Other", which on accounts whose labs come
 * from uploaded PDFs is most of the screen.
 *
 * ─── RULES ───────────────────────────────────────────────────────────
 *
 * A metric appears ONCE, in one group — same rule as the biopsychosocial
 * grouping, for the same reason: one measurement shown in three places reads
 * as three measurements. Where an analyte genuinely spans organs (albumin is
 * liver synthesis AND kidney loss) the table picks one primary and says so.
 *
 * Nothing is ever dropped. An unrecognised metric goes to "Other", because a
 * patient's own lab result must not vanish because we didn't recognise a name.
 */

export type BodySystem =
  | 'heart'
  | 'lungs'
  | 'kidneys'
  | 'liver'
  | 'blood'
  | 'metabolic'
  | 'immune'
  | 'nutrition'
  | 'body'
  | 'activity'
  | 'sleep'

export interface GroupableMetric {
  metricCode?: string
  metricName?: string
}

export interface BodySystemGroup<T> {
  /** null for the trailing "Other" bucket. */
  system: BodySystem | null
  label: string
  metrics: T[]
}

/**
 * Display order, chosen so the organ systems lead and the behavioural
 * groups (which are not organs, but are what Apple Health mostly carries)
 * trail. Labels are patient-facing: "Kidneys", not "Renal".
 */
const SYSTEM_ORDER: readonly { system: BodySystem; label: string }[] = [
  { system: 'heart', label: 'Heart & Circulation' },
  { system: 'lungs', label: 'Lungs & Breathing' },
  { system: 'blood', label: 'Blood' },
  { system: 'kidneys', label: 'Kidneys' },
  { system: 'liver', label: 'Liver' },
  { system: 'metabolic', label: 'Metabolic & Hormones' },
  { system: 'immune', label: 'Immune & Inflammation' },
  { system: 'nutrition', label: 'Nutrition & Vitamins' },
  { system: 'body', label: 'Body Measurements' },
  { system: 'activity', label: 'Activity & Fitness' },
  { system: 'sleep', label: 'Sleep' },
]

/**
 * Exact code → system. Covers both bounded namespaces.
 *
 * JUDGEMENT: the lipid panel (total/HDL/LDL cholesterol, triglycerides) sits
 * under Heart & Circulation rather than Metabolic. Lipids are metabolically
 * produced but are ordered, read and acted on as cardiovascular risk, and a
 * patient looking for "my cholesterol" looks under the heart. Move these four
 * lines to 'metabolic' if Ken disagrees.
 */
const BY_CODE: Readonly<Record<string, BodySystem>> = {
  // ── Apple Health (services/health.ts) ──
  'hk-bp-systolic': 'heart',
  'hk-bp-diastolic': 'heart',
  'hk-heart-rate': 'heart',
  'hk-resting-hr': 'heart',
  'hk-walking-hr': 'heart',
  'hk-hrv': 'heart',
  'hk-spo2': 'lungs',
  'hk-resp-rate': 'lungs',
  'hk-glucose': 'metabolic',
  'hk-weight': 'body',
  'hk-bmi': 'body',
  'hk-body-temp': 'body',
  'hk-steps': 'activity',
  'hk-active-energy': 'activity',
  'hk-distance-walking': 'activity',
  'hk-flights': 'activity',
  'hk-exercise-time': 'activity',
  'hk-sleep': 'sleep',

  // ── LOINC: backend tracked metrics ──
  '4548-4': 'metabolic',   // Hemoglobin A1C
  '1558-6': 'metabolic',   // Fasting glucose
  '2345-7': 'metabolic',   // Glucose
  '85354-9': 'heart',      // Blood pressure (systolic)
  '2093-3': 'heart',       // Total cholesterol   ← JUDGEMENT (see above)
  '2085-9': 'heart',       // HDL                 ← JUDGEMENT
  '13457-7': 'heart',      // LDL                 ← JUDGEMENT
  '2571-8': 'heart',       // Triglycerides       ← JUDGEMENT
  '33914-3': 'kidneys',    // eGFR
  '2160-0': 'kidneys',     // Creatinine
  '39156-5': 'body',       // BMI

  // ── LOINC: health-age biomarkers ──
  '1751-7': 'liver',       // Albumin — see JUDGEMENT in BY_NAME
  '6768-6': 'liver',       // Alkaline phosphatase
  '1988-5': 'immune',      // CRP
  '30522-7': 'immune',     // hs-CRP
  '6690-2': 'blood',       // WBC
  '736-9': 'blood',        // Lymphocyte %
  '26478-8': 'blood',      // Lymphocytes
  '787-2': 'blood',        // MCV
  '788-0': 'blood',        // RDW
}

/**
 * Name patterns for the unbounded `report-*` namespace, evaluated IN ORDER —
 * first match wins. Order is load-bearing: "microalbumin" must be tested
 * before "albumin", and "hdl cholesterol" resolves the same as "cholesterol"
 * so their relative order is safe, but narrower analytes generally come first.
 *
 * Word boundaries throughout: a bare substring test for "bun" matches
 * "bilirubin", and for "ast" matches "fasting".
 */
const BY_NAME: readonly { re: RegExp; system: BodySystem }[] = [
  // ── Kidneys ── (before Liver so urine albumin is not read as hepatic)
  { re: /\bmicro ?albumin/, system: 'kidneys' },
  { re: /\burine albumin|albumin[/ ]creatinine/, system: 'kidneys' },
  { re: /\begfr\b|\bgfr\b|glomerular/, system: 'kidneys' },
  { re: /\bcreatinine\b/, system: 'kidneys' },
  { re: /\bbun\b|blood urea|\burea\b/, system: 'kidneys' },
  { re: /\bsodium\b|\bpotassium\b|\bchloride\b|\bbicarbonate\b|\bco2\b|\banion gap\b/, system: 'kidneys' },
  { re: /\buric acid\b/, system: 'kidneys' },
  { re: /\bcystatin\b/, system: 'kidneys' },

  // ── Liver ──
  { re: /\balt\b|alanine amino/, system: 'liver' },
  { re: /\bast\b|aspartate amino/, system: 'liver' },
  { re: /alkaline phosphatase|\balp\b/, system: 'liver' },
  { re: /bilirubin/, system: 'liver' },
  { re: /\bggt\b|gamma[- ]glutamyl/, system: 'liver' },
  // JUDGEMENT: albumin and total protein are hepatic synthesis markers, so
  // they sit under Liver. They are equally read as nutrition and (via urine)
  // as kidney markers; the urine forms are caught above.
  { re: /\balbumin\b|total protein/, system: 'liver' },

  // ── Blood / haematology ──
  { re: /h(a)?emoglobin a1c|\ba1c\b|glycated/, system: 'metabolic' },   // before plain haemoglobin
  { re: /h(a)?emoglobin|\bhgb\b|\bhb\b/, system: 'blood' },
  { re: /h(a)?ematocrit|\bhct\b/, system: 'blood' },
  { re: /platelet|\bplt\b/, system: 'blood' },
  { re: /\brbc\b|red (blood )?cell/, system: 'blood' },
  { re: /\bwbc\b|white (blood )?cell|leu[ck]ocyte/, system: 'blood' },
  { re: /neutrophil|lymphocyte|monocyte|eosinophil|basophil/, system: 'blood' },
  { re: /\bmcv\b|\bmch\b|\bmchc\b|\brdw\b|\bmpv\b/, system: 'blood' },
  { re: /\binr\b|prothrombin|\bptt\b/, system: 'blood' },

  // ── Heart & circulation ── (lipids: JUDGEMENT, see BY_CODE)
  { re: /cholesterol|\bhdl\b|\bldl\b|\bvldl\b|triglyceride|lipid|apolipoprotein|lipoprotein/, system: 'heart' },
  { re: /blood pressure|systolic|diastolic/, system: 'heart' },
  { re: /heart rate|\bpulse\b|\bhrv\b/, system: 'heart' },
  { re: /troponin|\bbnp\b|natriuretic/, system: 'heart' },

  // ── Metabolic & hormones ──
  { re: /\bglucose\b|\bfasting glucose\b/, system: 'metabolic' },
  { re: /\binsulin\b|c[- ]peptide/, system: 'metabolic' },
  { re: /\btsh\b|thyro|\bt3\b|\bt4\b/, system: 'metabolic' },
  { re: /cortisol|testosterone|estradiol|\bfsh\b|\blh\b|progesterone|prolactin/, system: 'metabolic' },
  { re: /\bpsa\b/, system: 'metabolic' },

  // ── Immune & inflammation ──
  { re: /\bcrp\b|c[- ]reactive/, system: 'immune' },
  { re: /\besr\b|sedimentation/, system: 'immune' },
  { re: /\bana\b|rheumatoid|antibody|immunoglobul|\biga\b|\bigg\b|\bigm\b/, system: 'immune' },

  // ── Nutrition & vitamins ──
  { re: /vitamin|\bb12\b|cobalamin|\bfolate\b|folic/, system: 'nutrition' },
  { re: /\biron\b|ferritin|transferrin|\btibc\b/, system: 'nutrition' },
  { re: /\bcalcium\b|magnesium|phosphor/, system: 'nutrition' },

  // ── Lungs ──
  { re: /oxygen saturation|\bspo2\b|\bo2 sat/, system: 'lungs' },
  { re: /respirator|breath/, system: 'lungs' },

  // ── Body measurements ──
  { re: /\bweight\b|\bbmi\b|body mass|waist|\bheight\b/, system: 'body' },
  { re: /temperature/, system: 'body' },

  // ── Activity / sleep ──
  { re: /\bsteps?\b|calorie|energy|distance|flights|exercise|workout|stand hour/, system: 'activity' },
  { re: /\bsleep\b/, system: 'sleep' },
]

/** Lowercase, strip the report- prefix, and reduce punctuation to spaces. */
function normalize(metric: GroupableMetric): string {
  const raw =
    typeof metric.metricName === 'string' && metric.metricName.trim() !== ''
      ? metric.metricName
      : String(metric.metricCode ?? '').replace(/^report-/, '').replace(/-/g, ' ')
  return ` ${raw.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `
}

/** The body system a metric belongs to, or null when it cannot be placed. */
export function bodySystemForMetric(metric: GroupableMetric | null | undefined): BodySystem | null {
  if (!metric) return null

  const code = typeof metric.metricCode === 'string' ? metric.metricCode.trim() : ''
  const exact = BY_CODE[code]
  if (exact) return exact

  const name = normalize(metric)
  if (name.trim() === '') return null
  for (const { re, system } of BY_NAME) {
    if (re.test(name)) return system
  }
  return null
}

/**
 * Group metrics into body-system buckets, preserving the caller's order
 * within each and dropping buckets that would be empty.
 *
 * Returns a SINGLE unlabelled group when nothing can be placed, so a screen
 * whose metrics we recognise none of renders as the flat carousel it does
 * today rather than as one "Other" heading over everything.
 */
export function groupTrendsByBodySystem<T extends GroupableMetric>(
  metrics: readonly T[],
): BodySystemGroup<T>[] {
  const buckets = new Map<BodySystem | null, T[]>()
  for (const m of metrics) {
    const s = bodySystemForMetric(m)
    const list = buckets.get(s)
    if (list) list.push(m)
    else buckets.set(s, [m])
  }

  if (buckets.size === 1 && buckets.has(null)) {
    return [{ system: null, label: '', metrics: [...metrics] }]
  }

  const out: BodySystemGroup<T>[] = []
  for (const { system, label } of SYSTEM_ORDER) {
    const list = buckets.get(system)
    if (list && list.length > 0) out.push({ system, label, metrics: list })
  }
  const other = buckets.get(null)
  if (other && other.length > 0) out.push({ system: null, label: 'Other', metrics: other })
  return out
}
