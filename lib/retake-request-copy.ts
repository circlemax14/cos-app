/**
 * COS-1202 — what the retake card tells the patient it is asking FOR.
 *
 * ─── THE COMPLAINT ───────────────────────────────────────────────────
 *
 * The inbox card's subtitle was the literal string "asked you to retake an
 * assessment", written once and never read from `instrumentKey`. The "What"
 * cell beside it showed the server's `instrumentDisplayName`, which for a
 * scope is `scopeDisplayName()` — "check-in", "check-ins", "3 check-ins".
 *
 * So a request scoped to ONE newly added assessment and a request scoped to
 * the whole battery rendered as the same card. The request IS correctly
 * scoped and "Start now" DOES open the right instrument (COS-1181/1184/1191),
 * but COS-1197's acceptance criterion — "ONE retake request naming ONLY the
 * newly added assessment(s)" — is about what the patient can SEE, and nothing
 * on the card named anything.
 *
 * ─── WHY A PURE MODULE ───────────────────────────────────────────────
 *
 * Same split as lib/retake-queue.ts and lib/retake-routes.ts: the decision is
 * string-in / string-out, so it lives here and is tested under `node --test`
 * with no renderer, and the card stays dumb.
 *
 * ─── VOCABULARY IS NOT OURS TO INVENT ────────────────────────────────
 *
 * The dashboard already names this same key space —
 * cos-frontend/src/components/patient/RequestRetakeModal.tsx
 * (`labelForInstrumentKey` + DEFAULT_INSTRUMENTS) — and the push body already
 * speaks it to the patient via cos-backend `scopeDisplayName()`. Three
 * surfaces describing one request three ways is how a care manager and a
 * patient end up talking past each other, so the nouns below are ported from
 * those two, not authored here.
 *
 * Where the two differ only in punctuation ("Social & faith" in the picker vs
 * "social and faith check-ins" in the push) this takes the push's prose form:
 * it is the other PATIENT-facing surface, and COS-1168 already settled that
 * the push and this card must not word the same request differently.
 *
 * ⚠️ INSTRUMENT TITLES ARE NOT PORTED. They come from the catalog the caller
 * already holds, via `titleOf`. A hardcoded id → title map here would be a
 * fourth copy of the catalog and would drift the day an instrument is renamed
 * or an agency adds its own — which is the exact failure COS-1169 hit when
 * `lsns` had been sitting in the dashboard's static list against a catalog
 * that says `lsns-6`.
 */

import { parseRetakeScopeKey } from './retake-queue.ts'

/**
 * Above this many members a `set:` is counted rather than listed. Three names
 * is already a long subtitle on a phone; forty is a wall.
 */
const MAX_NAMED = 3

/*
 * COS-1203 follow-up #2 — THERE IS NO PENDING PLACEHOLDER, AND THERE MUST NOT BE.
 *
 * Round 3 added `RETAKE_ASK_PHRASE_PENDING = '…'` here and returned it while the
 * catalog that supplies the name was in flight, to stop the card painting one
 * frame of the server's vague noun ("check-in") before the real title landed.
 *
 * The placeholder names NOTHING, and it did not feed the subtitle alone. The
 * card derives FOUR surfaces from this one string: the subtitle, the "What"
 * cell, the composed card utterance, and the accessibilityLabel on "Start now"
 * — the only control a screen-reader user activates. So for the whole duration
 * of a network fetch VoiceOver announced an ellipsis and the card named nothing.
 *
 * That is the wrong trade. Round 3 removed a one-render flash of a vague but
 * READABLE noun and bought a window in which the card is unreadable. For
 * accessibility, readable-and-vague beats precise-or-nothing: the branches below
 * already degrade to something a patient can read when a title is absent
 * (the server's `instrumentDisplayName`, a count, "your check-in"), and an
 * absent title and a title still arriving look identical to a reader.
 *
 * So the phrase is ALWAYS the best readable name available right now, and it
 * upgrades in place when the catalog resolves. The copy may change once as it
 * does; that is what it did before round 3, and it is not a defect.
 */

/**
 * Every string that enters this module from outside goes through this.
 *
 * COS-1203 — `??` DOES NOT CATCH `''`. The single-instrument branch was
 * `titleOf(key) ?? fromServer ?? 'your check-in'`, so a blank title
 * short-circuited BOTH fallbacks and this function returned `''`: the patient
 * read "asked you to retake " and VoiceOver said "...asked you to retake .
 * Takes about 2 minutes."
 *
 * Blank titles are not hypothetical. The card's `titleOf` is
 * `getWarmerInstrumentLabel(def.instrumentId, def.name)`, which returns
 * `def.name` VERBATIM when no warmer label exists — and an agency-authored
 * instrument's name can be blank. Whitespace-only is the same thing to a
 * reader, and `||` does not catch THAT, hence the trim.
 *
 * This is a known recurring class here (feedback_* on `??` vs `''`), so it is
 * one funnel rather than a guard per branch.
 */
const present = (s: string | null | undefined): string | undefined => s?.trim() || undefined

export interface RetakeAskPhraseArgs {
  /** The request's raw `instrumentKey` — see lib/retake-queue.ts for the key space. */
  instrumentKey: string
  /**
   * Catalog title for an instrument id, or undefined when the catalog has not
   * loaded yet / does not carry that instrument (the route is plan-tier
   * filtered, so `basic` gets an empty list).
   */
  titleOf: (instrumentId: string) => string | undefined
  /**
   * The server's `instrumentDisplayName`, used ONLY when a single instrument's
   * title does not resolve. It is the backend's own name for the same row, so
   * it is a better last resort than printing the id at a patient.
   */
  fallback?: string
}

/**
 * The noun phrase naming what is being asked for, ready to drop into
 * "<who> asked you to retake ___." and into the card's "What" cell.
 *
 * Never returns an instrument id, never returns blank, and never returns a
 * wordless placeholder: an unresolved title — whether it is absent or merely
 * still in flight — degrades to a count ("3 check-ins") or to the server's
 * display name, both of which are things a patient can read and a screen reader
 * can say. See the note above `present` for why there is no pending state.
 */
export function retakeAskPhrase({
  instrumentKey,
  titleOf,
  fallback,
}: RetakeAskPhraseArgs): string {
  const key = present(instrumentKey) ?? ''
  const fromServer = present(fallback)
  // The catalog title for an id, blank-normalised — see `present`.
  const titleFor = (id: string): string | undefined => present(titleOf(id))
  if (!key) return fromServer ?? 'your check-ins'

  // The health-status intake is its own wizard and its own track (COS-1178),
  // and both the picker and the push call it this.
  if (key === 'full-intake') return 'your Health Status questionnaire'

  const scope = parseRetakeScopeKey(key)

  // No scope: a bare instrument id. This is the COS-1197 case — name it.
  if (!scope) return titleFor(key) ?? fromServer ?? 'your check-in'

  if (scope.kind === 'all') return 'all your check-ins'

  if (scope.kind === 'domain') {
    switch (scope.domain) {
      case 'biological':
        return 'your physical health check-ins'
      case 'psychological':
        return 'your mental health check-ins'
      default:
        // Social carries spiritual (COS-851), and every surface says so.
        return 'your social and faith check-ins'
    }
  }

  const ids = scope.instrumentIds
  if (ids.length > MAX_NAMED) return `${ids.length} of your check-ins`

  const titles = ids.map((id) => titleFor(id))
  /*
   * All or nothing. Naming two of three members and silently dropping the
   * third would understate the ask, and the patient would finish the two the
   * card named and find the request still open.
   */
  if (titles.some((t) => !t)) {
    // NOT the server's name here: `scopeDisplayName` renders a set as
    // "check-in" / "3 check-ins", which is the vague copy this ticket exists
    // to remove.
    return ids.length === 1 ? 'your check-in' : `${ids.length} of your check-ins`
  }
  return joinTitles(titles as string[])
}

/** "A", "A and B", "A, B and C" — no Oxford comma, matching the rest of the app's copy. */
function joinTitles(titles: string[]): string {
  if (titles.length === 1) return titles[0]
  return `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`
}

/**
 * Does `retakeAskPhrase` for this key actually read a catalog title?
 *
 * COS-1203 — the inbox card holds the ['instruments-recommended'] query for one
 * reason: to supply `titleOf`. That query had no `enabled` and sat above the
 * card's own `if (!first) return null`, so every Home / plan-tab mount fetched
 * the catalog for every patient — including the overwhelming majority with no
 * pending retake, who see nothing, and `basic`-plan patients for whom the route
 * is tier-filtered to an empty list regardless.
 *
 * hooks/use-retake-queue.ts gates the identical query on `scope !== null` for
 * exactly this reason. The card's question is a different one — "would the
 * phrase even look at a title?" — and only this module can answer it, because
 * most keys are named from the strings above and never reach the catalog: a
 * domain scope, the whole battery, the health-status intake, an over-long set.
 *
 * It lives HERE, beside the branches it describes, so the two cannot drift, and
 * the test asserts them against each other key by key rather than separately.
 */
export function retakeAskPhraseNeedsTitles(instrumentKey: string): boolean {
  const key = present(instrumentKey) ?? ''
  if (!key || key === 'full-intake') return false
  const scope = parseRetakeScopeKey(key)
  // No scope: a bare instrument id, whose title is the entire point (COS-1197).
  if (!scope) return true
  return scope.kind === 'set' && scope.instrumentIds.length <= MAX_NAMED
}
