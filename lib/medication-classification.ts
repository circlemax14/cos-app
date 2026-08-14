/**
 * Medical vs Psychiatric, for the medications list — SCRUM-674a.
 *
 * Ken 2026-08-14: wants the plan screen's medications divided into medical and
 * psychiatric, in the list and in the add flow.
 *
 * ─── THE ASYMMETRY THAT DECIDES THE DESIGN ───────────────────────────
 *
 * These two errors are NOT equally bad:
 *
 *   - an antipsychotic shown under "Medical"  → a missed grouping
 *   - lisinopril shown under "Psychiatric"    → the app asserting something
 *                                                false about the patient, on a
 *                                                screen they may show a family
 *                                                member or a clinician
 *
 * So this classifier is deliberately ONE-SIDED: it names Psychiatric only on a
 * confident match against a curated list, and everything else is Medical. It
 * will under-call psychiatric medications. That is the intended failure
 * direction.
 *
 * (This reverses what I first proposed to Ken — a third "Unclassified" bucket.
 * On reflection that is worse: it would hold most of a typical list, tells the
 * patient nothing, and makes the screen look broken.)
 *
 * ─── WHY A NAME LIST AND NOT ATC ─────────────────────────────────────
 *
 * The right long-term source is RxNorm → ATC (psychiatric = N05 psycholeptics
 * + N06 psychoanaleptics). That needs a network integration, caching, and a
 * failure path — worth doing, not worth blocking a display grouping on. The
 * list below IS the ATC N05/N06 content, spelled out by generic name and
 * common US brand, so swapping in a real ATC lookup later changes the source
 * of the same answer rather than the answer itself.
 *
 * ─── N03, LEFT FOR KEN ───────────────────────────────────────────────
 *
 * Antiepileptics widely used as mood stabilisers — lamotrigine, valproate,
 * carbamazepine — are ATC N03, not N05/N06. Whether they read as psychiatric
 * depends on why the patient is taking them, which we do not know. They are
 * listed separately below and are NOT psychiatric by default. Flip
 * `treatMoodStabilisersAsPsychiatric` when Ken rules.
 */

export type MedicationClass = 'medical' | 'psychiatric'

/**
 * ATC N05 (psycholeptics) + N06 (psychoanaleptics), by generic name and common
 * US brand. Matched on word boundaries against a normalised name.
 */
const PSYCHIATRIC = [
  // N06A antidepressants
  'fluoxetine', 'sertraline', 'paroxetine', 'citalopram', 'escitalopram', 'fluvoxamine',
  'venlafaxine', 'desvenlafaxine', 'duloxetine', 'levomilnacipran',
  'bupropion', 'mirtazapine', 'trazodone', 'nefazodone', 'vortioxetine', 'vilazodone',
  'amitriptyline', 'nortriptyline', 'imipramine', 'desipramine', 'protriptyline',
  'clomipramine', 'doxepin', 'trimipramine', 'amoxapine', 'maprotiline',
  'phenelzine', 'tranylcypromine', 'isocarboxazid', 'selegiline',
  'prozac', 'zoloft', 'paxil', 'pexeva', 'celexa', 'lexapro', 'luvox',
  'effexor', 'pristiq', 'cymbalta', 'fetzima', 'wellbutrin', 'zyban', 'aplenzin',
  'remeron', 'desyrel', 'oleptro', 'trintellix', 'brintellix', 'viibryd',
  'elavil', 'pamelor', 'tofranil', 'norpramin', 'anafranil', 'silenor',
  'nardil', 'parnate', 'marplan', 'emsam',

  // N05A antipsychotics
  'risperidone', 'olanzapine', 'quetiapine', 'aripiprazole', 'ziprasidone',
  'paliperidone', 'lurasidone', 'asenapine', 'iloperidone', 'brexpiprazole',
  'cariprazine', 'clozapine', 'pimavanserin', 'lumateperone',
  'haloperidol', 'chlorpromazine', 'fluphenazine', 'perphenazine', 'trifluoperazine',
  'thioridazine', 'thiothixene', 'loxapine', 'molindone', 'pimozide',
  'risperdal', 'zyprexa', 'seroquel', 'abilify', 'geodon', 'invega', 'latuda',
  'saphris', 'fanapt', 'rexulti', 'vraylar', 'clozaril', 'versacloz', 'nuplazid',
  'caplyta', 'haldol', 'thorazine', 'prolixin', 'trilafon', 'stelazine',
  'mellaril', 'navane', 'loxitane', 'moban', 'orap',

  // N05AN lithium
  'lithium', 'lithobid', 'eskalith',

  // N05B anxiolytics
  'alprazolam', 'lorazepam', 'clonazepam', 'diazepam', 'chlordiazepoxide',
  'oxazepam', 'clorazepate', 'buspirone',
  'xanax', 'ativan', 'klonopin', 'valium', 'librium', 'tranxene', 'buspar',

  // N05C hypnotics and sedatives
  'zolpidem', 'eszopiclone', 'zaleplon', 'temazepam', 'triazolam', 'flurazepam',
  'ramelteon', 'suvorexant', 'lemborexant', 'daridorexant',
  'ambien', 'lunesta', 'sonata', 'restoril', 'halcion', 'dalmane',
  'rozerem', 'belsomra', 'dayvigo', 'quviviq',

  // N06B psychostimulants / ADHD
  'methylphenidate', 'dexmethylphenidate', 'amphetamine', 'dextroamphetamine',
  'lisdexamfetamine', 'atomoxetine', 'viloxazine', 'modafinil', 'armodafinil',
  'ritalin', 'concerta', 'metadate', 'focalin', 'adderall', 'mydayis',
  'dexedrine', 'zenzedi', 'vyvanse', 'strattera', 'qelbree', 'provigil', 'nuvigil',

  // N06D anti-dementia
  'donepezil', 'rivastigmine', 'galantamine', 'memantine',
  'aricept', 'exelon', 'razadyne', 'namenda',
] as const

/**
 * ATC N03 — antiepileptics commonly prescribed as mood stabilisers. NOT
 * psychiatric by default: whether they belong there depends on the indication,
 * which we do not hold. Ken to rule.
 */
const MOOD_STABILISERS = [
  'lamotrigine', 'lamictal',
  'valproate', 'valproic', 'divalproex', 'depakote', 'depakene',
  'carbamazepine', 'tegretol', 'equetro',
  'oxcarbazepine', 'trileptal',
  'topiramate', 'topamax',
] as const

/**
 * Deliberately NOT classified as psychiatric, though they often are in
 * practice — each has a common non-psychiatric indication, and the asymmetry
 * above says we should not assert the psychiatric one:
 *
 *   clonidine, guanfacine  — antihypertensives, also used in ADHD
 *   hydroxyzine            — antihistamine, also used for anxiety
 *   propranolol            — beta blocker, also used for performance anxiety
 *   gabapentin, pregabalin — nerve pain, also used off-label for anxiety
 *   prazosin               — antihypertensive, also used for PTSD nightmares
 *
 * Listed here so the omission reads as a decision rather than a gap.
 */
export const DUAL_INDICATION_NOT_CLASSIFIED = [
  'clonidine', 'guanfacine', 'hydroxyzine', 'propranolol',
  'gabapentin', 'pregabalin', 'prazosin',
] as const

/** Lowercase, strip punctuation, pad so word-boundary checks are simple. */
function normalise(name: string): string {
  return ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `
}

function matches(haystack: string, needles: readonly string[]): boolean {
  // Both boundaries, always. `normalise` reduces every separator to a space
  // and pads the ends, so a whole-word check is sufficient — and a leading-only
  // check is actively wrong: it made "Ambient humidifier" match "ambien".
  return needles.some((n) => haystack.includes(` ${n} `))
}

export interface ClassifiableMedication {
  name?: string | null
  genericName?: string | null
}

/**
 * Classify a medication for DISPLAY GROUPING ONLY.
 *
 * Not a clinical determination, never written to the record, and never shown
 * to the patient as a statement about their care — it decides which heading a
 * row sits under, nothing more.
 */
export function classifyMedication(
  med: ClassifiableMedication | null | undefined,
  opts?: { treatMoodStabilisersAsPsychiatric?: boolean },
): MedicationClass {
  const text = normalise(`${med?.name ?? ''} ${med?.genericName ?? ''}`)
  if (text.trim() === '') return 'medical'

  if (matches(text, PSYCHIATRIC)) return 'psychiatric'
  if (opts?.treatMoodStabilisersAsPsychiatric && matches(text, MOOD_STABILISERS)) {
    return 'psychiatric'
  }
  return 'medical'
}

/** Split a list into the two display buckets, preserving order within each. */
export function splitByMedicationClass<T extends ClassifiableMedication>(
  meds: readonly T[],
  opts?: { treatMoodStabilisersAsPsychiatric?: boolean },
): { medical: T[]; psychiatric: T[] } {
  const medical: T[] = []
  const psychiatric: T[] = []
  for (const m of meds) {
    ;(classifyMedication(m, opts) === 'psychiatric' ? psychiatric : medical).push(m)
  }
  return { medical, psychiatric }
}
