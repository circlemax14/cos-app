/**
 * Grouping clinic labs and Apple Health metrics by body system / organ —
 * Ken 2026-08-14: "These I'd like to group by body system/organ."
 *
 * ─── WHERE THIS TAXONOMY CAME FROM ───────────────────────────────────
 *
 * Ken referred to a doc with his categories. It was not located when this file
 * was first written, so the groups below started as a conventional clinical
 * panel grouping rather than his, on the bet that reconciling later would be a
 * data edit rather than a rewrite.
 *
 * 2026-08-16 — HIS SOURCES ARRIVED, and the bet paid: this is a data edit.
 *
 *   [TOP2000] LOINC Mapper's Guide to the Top 2000+ US Lab Tests, v1.6,
 *             Regenstrief Institute, June 2017.
 *   [HCUP]    LOINC Codes for Laboratory Data in the Enhanced Administrative
 *             Database, AHRQ HCUP, Oct 2010. 26 core tests + valid ranges.
 *
 * Every code added below carries its source in a trailing comment. Codes that
 * were already here have been checked against [TOP2000] and none were wrong.
 * One assignment CHANGED as a result — hs-CRP, see the note on it below — and
 * that change is Regenstrief's stated clinical use, not our opinion.
 *
 * NOT SETTLED BY THESE DOCS: neither source maps a code to an ORGAN. [TOP2000]
 * gives a lab-discipline Class (Chem / Heme / Micro / Coagulation …) and a
 * specimen System (Ser/Plas, Bld, Urine); [HCUP] gives codes, units and ranges.
 * So the organ assignment stays ours. What the docs did settle is WHICH CODE
 * IS WHICH — which is what the table was actually getting wrong by omission.
 * The judgement calls below still want Ken's eye.
 *
 * ALSO IN [HCUP] AND NOT YET USED: absolute and relative valid ranges for 26
 * analytes. We show lab values today with no reference range at all. That is a
 * real gap and a separate piece of work — it needs a UI decision, not a table.
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
  // [TOP2000] distinguishes these two by clinical USE, and they are not the
  // same marker: 1988-5 "is used to assess severity of inflammatory diseases
  // such as rheumatoid arthritis"; 30522-7 "is used to assess cardiovascular
  // risk". Both sat under Immune here, which put a patient's cardiac-risk
  // number under an inflammation heading. hs-CRP therefore moves to Heart.
  // This is Regenstrief's stated use, not our reading.
  '1988-5': 'immune',      // CRP, standard sensitivity          [TOP2000]
  '30522-7': 'heart',      // hs-CRP — cardiovascular risk       [TOP2000]
  '6690-2': 'blood',       // WBC
  '736-9': 'blood',        // Lymphocyte %
  '26478-8': 'blood',      // Lymphocytes
  '787-2': 'blood',        // MCV
  '788-0': 'blood',        // RDW, as a ratio/%                  [TOP2000]

  // ══ ADDED 2026-08-16 FROM KEN'S SOURCES ═══════════════════════════════
  //
  // WHY THIS MATTERS MORE THAN IT LOOKS: BY_CODE is consulted before BY_NAME,
  // but a FHIR Observation that arrives with NO display name falls through to
  // normalize(), which then has only the bare code to match on — "1920 8"
  // matches no pattern, so the result lands in "Other". Every code below was
  // already handled by name; none of them were handled when the name was
  // missing. This closes that hole for the labs US hospitals order most.
  //
  // ── Liver ── [HCUP] 1-7, [TOP2000] Chem
  '1742-6': 'liver',       // ALT (SGPT)                         [TOP2000]
  '1920-8': 'liver',       // AST (SGOT)                         [HCUP 4]
  '1783-0': 'liver',       // ALP, whole blood                   [HCUP 2A]
  '1975-2': 'liver',       // Bilirubin total                    [HCUP 7]
  '14631-6': 'liver',      // Bilirubin total, molar              [HCUP 7A]
  '2324-2': 'liver',       // GGT                                [TOP2000]
  '2885-2': 'liver',       // Total protein                      [TOP2000]

  // ── Kidneys ── [HCUP] 11, 22-23, 25
  '3094-0': 'kidneys',     // BUN                                [HCUP 25]
  '14937-7': 'kidneys',    // BUN, molar                         [HCUP 25A]
  '14682-9': 'kidneys',    // Creatinine, molar                  [HCUP 11A]
  '2951-2': 'kidneys',     // Sodium                             [HCUP 23]
  '2947-0': 'kidneys',     // Sodium, whole blood                [HCUP 23A]
  '2823-3': 'kidneys',     // Potassium                          [HCUP 22]
  '6298-4': 'kidneys',     // Potassium, whole blood             [HCUP 22A]
  '2075-0': 'kidneys',     // Chloride                           [TOP2000]
  '2028-9': 'kidneys',     // CO2 total                          [TOP2000]
  '1963-8': 'kidneys',     // Bicarbonate, serum                 [HCUP 6]
  '1962-0': 'kidneys',     // Bicarbonate, plasma                [HCUP 6A]
  '33037-3': 'kidneys',    // Anion gap                          [TOP2000]
  '3084-1': 'kidneys',     // Urate / uric acid                  [TOP2000]
  '48642-3': 'kidneys',    // eGFR MDRD, non-black               [TOP2000]
  '48643-1': 'kidneys',    // eGFR MDRD, black                   [TOP2000]

  // ── Blood ── [HCUP] 13, 15, 17, 20, 26
  '718-7': 'blood',        // Haemoglobin                        [HCUP 13]
  '30352-9': 'blood',      // Haemoglobin, capillary             [HCUP 13A]
  '4544-3': 'blood',       // Haematocrit, automated             [TOP2000]
  '789-8': 'blood',        // RBC                                [TOP2000]
  '777-3': 'blood',        // Platelets, automated               [HCUP 20B]
  '26515-7': 'blood',      // Platelets, method unstated         [HCUP 20]
  '26464-8': 'blood',      // WBC, method unstated               [HCUP 26]
  '785-6': 'blood',        // MCH                                [TOP2000]
  '786-4': 'blood',        // MCHC                               [TOP2000]
  // [TOP2000] warns explicitly that 788-0 (%) and 21000-5 (fL) are the same
  // test reported in different units and must not be confused. Both are RDW
  // and both belong here; carrying only one silently drops the other lab's.
  '21000-5': 'blood',      // RDW, as a volume in fL             [TOP2000]
  '6301-6': 'blood',       // INR                                [HCUP 15]
  '5902-2': 'blood',       // Prothrombin time                   [HCUP 15A]
  '14979-9': 'blood',      // aPTT                               [HCUP 17]
  '751-8': 'blood',        // Neutrophils, absolute              [TOP2000]
  '731-0': 'blood',        // Lymphocytes, absolute              [TOP2000]

  // ── Heart ── [HCUP] 10, 24
  '10839-9': 'heart',      // Troponin I                         [HCUP 24]
  '42757-5': 'heart',      // Troponin I, whole blood            [HCUP 24A]
  '6598-7': 'heart',       // Troponin T                         [TOP2000]
  '13969-1': 'heart',      // CK-MB, mass                        [HCUP 10]
  '32673-6': 'heart',      // CK-MB, activity                    [HCUP 10A]
  '2157-6': 'heart',       // Creatine kinase total              [HCUP 9]
  '30934-4': 'heart',      // BNP                                [TOP2000]
  '33762-6': 'heart',      // NT-proBNP                          [TOP2000]
  '2089-1': 'heart',       // LDL, method unstated  ← JUDGEMENT  [TOP2000]
  '18262-6': 'heart',      // LDL, direct assay     ← JUDGEMENT  [TOP2000]
  '2095-8': 'heart',       // HDL/total ratio       ← JUDGEMENT  [TOP2000]
  '9830-1': 'heart',       // Total/HDL ratio       ← JUDGEMENT  [TOP2000]
  '43396-1': 'heart',      // Non-HDL cholesterol   ← JUDGEMENT  [TOP2000]

  // ── Lungs ── [HCUP] 14, 18-19, 21. Blood gases are respiratory function
  // even though the specimen is blood; a patient looking for "my oxygen"
  // looks under Lungs, not Blood.
  '2744-1': 'lungs',       // pH, arterial                       [HCUP 19]
  '2019-8': 'lungs',       // pCO2, arterial                     [HCUP 18]
  '2703-7': 'lungs',       // pO2, arterial                      [HCUP 21]
  '2708-6': 'lungs',       // O2 saturation, arterial            [HCUP 21A]
  '3150-0': 'lungs',       // FiO2, inhaled O2 %                 [HCUP 14]
  '3151-8': 'lungs',       // Inhaled O2 flow rate               [HCUP 14A]
  '1925-7': 'lungs',       // Base excess                        [HCUP 5A]
  '1922-4': 'lungs',       // Base deficit                       [HCUP 5]

  // ── Metabolic & hormones ──
  // [TOP2000] on TSH: 3016-3 is the obsolete first-generation assay and
  // should be avoided; 11579-0 (2nd gen) and 11580-8 (3rd gen) are the ones
  // in real use. All three map to the same place for the patient, so all
  // three are carried — the distinction matters to the lab, not the reader.
  '3016-3': 'metabolic',   // TSH, 1st generation                [TOP2000]
  '11579-0': 'metabolic',  // TSH, 2nd generation                [TOP2000]
  '11580-8': 'metabolic',  // TSH, 3rd generation                [TOP2000]
  '3024-7': 'metabolic',   // Free T4                            [TOP2000]
  '3053-6': 'metabolic',   // T3                                 [TOP2000]
  '3026-2': 'metabolic',   // Total T4                           [TOP2000]
  '2339-0': 'metabolic',   // Glucose, whole blood               [HCUP 12D]
  '14749-6': 'metabolic',  // Glucose, molar                     [HCUP 12A]
  '20448-7': 'metabolic',  // Insulin                            [TOP2000]
  '1986-9': 'metabolic',   // C-peptide                          [TOP2000]
  '2857-1': 'metabolic',   // PSA                                [TOP2000]
  '2986-8': 'metabolic',   // Testosterone                       [TOP2000]
  '2143-6': 'metabolic',   // Cortisol                           [TOP2000]
  // JUDGEMENT: amylase and lipase are pancreatic, and this taxonomy has no
  // pancreas group. Adding one for two analytes would put a near-empty
  // heading on the screen, so they sit under Metabolic — the pancreas being
  // the metabolic organ a patient associates with blood sugar. If Ken wants
  // a Digestive group, these two and the liver block move together.
  '1798-8': 'metabolic',   // Amylase           ← JUDGEMENT      [HCUP 3]
  '3040-3': 'metabolic',   // Lipase            ← JUDGEMENT      [TOP2000]
  '2532-0': 'metabolic',   // LDH                                [HCUP 16]

  // ── Nutrition & vitamins ──
  '1989-3': 'nutrition',   // Vitamin D, calcidiol 25-OH         [TOP2000]
  '2132-9': 'nutrition',   // Vitamin B12 / cobalamin            [TOP2000]
  '2284-8': 'nutrition',   // Folate, serum                      [TOP2000]
  '2276-4': 'nutrition',   // Ferritin                           [TOP2000]
  '2498-4': 'nutrition',   // Iron                               [TOP2000]
  '2500-7': 'nutrition',   // TIBC                               [TOP2000]
  '2502-3': 'nutrition',   // Iron saturation                    [TOP2000]
  '17861-6': 'nutrition',  // Calcium, mass                      [HCUP 8]
  '2000-8': 'nutrition',   // Calcium, molar                     [HCUP 8A]
  '19123-9': 'nutrition',  // Magnesium                          [TOP2000]
  '2777-1': 'nutrition',   // Phosphate                          [TOP2000]

  // ── Immune & inflammation ──
  '4537-7': 'immune',      // ESR, Westergren                    [TOP2000]
  '30341-2': 'immune',     // ESR, method unstated               [TOP2000]
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
