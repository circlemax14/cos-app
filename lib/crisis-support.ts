/**
 * When to put crisis resources in front of someone, and which ones.
 *
 * WHY THIS EXISTS
 *
 * PHQ-9 has been live in this app with no `comingSoon` gate since the first
 * assessment shipped. Its ninth item reads:
 *
 *   "Thoughts that you would be better off dead, or hurting yourself"
 *
 * Until now, answering that question — with any severity — did nothing. The
 * `careAction` field on every risk band ("care-team-check-in", "care-team-flag")
 * is stored on the record and passed into an LLM prompt, and is read by no code
 * that does anything. A patient could tell this app they were thinking about
 * hurting themselves, and the app's entire response was to file it.
 *
 * DESIGN, and the reasoning behind each choice
 *
 * IMMEDIATE, NOT AT THE END. Support appears the moment the item is endorsed,
 * on that question. Waiting for the results screen assumes they finish — and
 * question nine of nine is a plausible place to stop.
 *
 * ANY ENDORSEMENT, NOT JUST "NEARLY EVERY DAY". "Several days" is above the
 * threshold. The cost of showing a helpline to someone who did not need it is
 * a card they scroll past; the cost of the reverse is not comparable, and the
 * asymmetry is the whole argument.
 *
 * NEVER BLOCKS. No modal, no gate, no "you must acknowledge this". A patient
 * who learns that honest answers trap them in a dialog learns to answer
 * dishonestly, and then the instrument measures nothing. It sits inline, under
 * the question, and they can carry on or not.
 *
 * NEVER SCOLDS, NEVER DIAGNOSES. It states what is available. It does not tell
 * them what they are feeling, does not say "you may be experiencing X", and
 * does not congratulate them for sharing.
 *
 * NOT CONTINGENT ON SUBMITTING. The trigger is the answer, not the save. This
 * matters more than it looks: until today, a Brief-COPE submission 400'd and
 * lost everything, and any design that only reacts to a persisted record
 * inherits every bug in the write path.
 *
 * US-ONLY, STATED PLAINLY. 988 and 741741 are US services. Everyone on this
 * platform is US-based (Epic/Fasten, US clinics), so that is the correct
 * default — but it IS a default, and an international patient must not be
 * handed a number that does not answer. See `CRISIS_REGION`.
 *
 * NO IMPORTS, deliberately: exercised by `node --test`, which resolves neither
 * the '@/' alias nor an extensionless relative TS import. Same constraint as
 * today-timeline.ts and assessment-grouping.ts.
 */

export type CrisisContactKind = 'call' | 'text' | 'emergency'

export interface CrisisResource {
  kind: CrisisContactKind
  /** What the patient reads. */
  label: string
  /** One line on when this is the right one. */
  detail: string
  /** Dialable / textable value. */
  value: string
  /** Prefilled body for `kind: 'text'`. */
  smsBody?: string
}

/** Stated so nobody has to infer it from the phone numbers. */
export const CRISIS_REGION = 'US' as const

/**
 * Ordered least-drastic first. Someone in distress reading top-to-bottom
 * should meet "talk to a person" before "call an ambulance" — leading with 911
 * reads as an accusation and is the wrong first offer for most endorsements.
 */
export const CRISIS_RESOURCES: readonly CrisisResource[] = [
  {
    kind: 'call',
    label: '988 Suicide & Crisis Lifeline',
    detail: 'Free, confidential, 24/7',
    value: '988',
  },
  {
    kind: 'text',
    label: 'Text the Crisis Text Line',
    detail: 'If you would rather not speak out loud',
    value: '741741',
    smsBody: 'HOME',
  },
  {
    kind: 'emergency',
    label: 'Call 911',
    detail: 'If you are in immediate danger',
    value: '911',
  },
]

/**
 * Items whose endorsement means "offer support now", by instrument.
 *
 * Kept as an explicit table rather than a heuristic over item text. A regex
 * for "suicide" or "hurting yourself" would silently start or stop matching
 * when an instrument's wording is revised, and this is not a thing that should
 * change because a copy edit landed.
 *
 * DELIBERATELY ABSENT:
 *   ace q9 — "Was a household member depressed or mentally ill, or did a
 *   household member attempt suicide?" That is somebody else, decades ago. It
 *   is history, not current risk, and treating it as an emergency would both
 *   be wrong and teach patients that this app over-reacts. ACE gets support on
 *   its RESULT instead (see shouldOfferSupportOnResult) because the subject
 *   matter is heavy, not because the score implies present danger.
 *
 *   pcl-5 — no item asks about self-harm. Its high band is handled on results.
 */
const RISK_ITEMS: Readonly<Record<string, readonly string[]>> = {
  'phq-9': ['q9'],
}

/**
 * True when this specific answer, right now, warrants showing crisis support.
 *
 * `value` is whatever the stepper holds: a number for likert/choice items.
 * Anything that is not a number above zero is not an endorsement — including
 * undefined (unanswered) and 0 ("Not at all").
 */
export function shouldOfferImmediateSupport(
  instrumentId: string,
  itemId: string,
  value: unknown,
): boolean {
  const risky = RISK_ITEMS[instrumentId]
  if (!risky || !risky.includes(itemId)) return false
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/**
 * True when a completed result should lead with support.
 *
 * Three independent reasons, any of which is enough:
 *   1. the patient endorsed a risk item anywhere in this sitting
 *   2. the band came back `high` severity
 *   3. the band carries a careAction asking for a human — the field that,
 *      until now, nothing read
 */
export function shouldOfferSupportOnResult(input: {
  instrumentId: string
  responses?: Record<string, unknown> | null
  severity?: string | null
  careAction?: string | null
}): boolean {
  const { instrumentId, responses, severity, careAction } = input

  const risky = RISK_ITEMS[instrumentId] ?? []
  for (const itemId of risky) {
    if (shouldOfferImmediateSupport(instrumentId, itemId, responses?.[itemId])) return true
  }

  if (severity === 'high') return true

  if (typeof careAction === 'string' && careAction.trim() !== '') {
    // Any careAction at all means the band's own author wanted a person
    // involved. Matching on specific strings would silently stop working the
    // first time somebody seeds a new one.
    return true
  }

  return false
}

/**
 * Instruments whose SUBJECT MATTER warrants offering support on completion
 * regardless of score, because taking them can be hard in itself.
 *
 * ACE asks directly about childhood abuse and neglect; a score of zero does
 * not mean the half hour spent answering was easy.
 */
const HEAVY_SUBJECT_INSTRUMENTS: readonly string[] = ['ace', 'pcl-5']

export function isHeavySubject(instrumentId: string): boolean {
  return HEAVY_SUBJECT_INSTRUMENTS.includes(instrumentId)
}

/** `tel:` / `sms:` URL for a resource. Kept here so the UI does not hand-build them. */
export function crisisResourceUrl(r: CrisisResource): string {
  if (r.kind === 'text') {
    // The `?&body=` form is what iOS accepts; Android tolerates it.
    return r.smsBody ? `sms:${r.value}?&body=${encodeURIComponent(r.smsBody)}` : `sms:${r.value}`
  }
  return `tel:${r.value}`
}
