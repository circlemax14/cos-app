/**
 * COS-1202 — the retake card has to name what it is asking for.
 *
 * The acceptance criterion for COS-1197 is "ONE retake request naming ONLY the
 * newly added assessment(s)". The request was scoped correctly and "Start now"
 * opened the right instrument, but the card's copy was the fixed string
 * "asked you to retake an assessment" and its "What" cell showed the server's
 * `scopeDisplayName` — "check-in" / "3 check-ins". So the criterion was not
 * observable from the UI at all, which is what these pin.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { stripComments } from './strip-comments.mjs'

import * as retakeCopy from '../../lib/retake-request-copy.ts'
import { retakeAskPhrase, retakeAskPhraseNeedsTitles } from '../../lib/retake-request-copy.ts'

/** Stands in for the ['instruments-recommended'] catalog the card holds. */
const TITLES: Record<string, string> = {
  'gad-7': 'Anxiety check-in',
  'sleep-4': 'Sleep check-in',
  'cognition-8': 'Thinking & memory check-in',
  'phq-9': 'Mood: full check',
  'dsq-nci': 'Nutrition check-in',
}
const titleOf = (id: string): string | undefined => TITLES[id]
const phrase = (instrumentKey: string, fallback?: string) =>
  retakeAskPhrase({ instrumentKey, titleOf, fallback })

describe('retakeAskPhrase', () => {
  it('THE BUG: one newly added assessment and the whole battery no longer read alike', () => {
    // This is the assertion that fails on the old card. Both of these rendered
    // as "asked you to retake an assessment", and their "What" cells as
    // "check-in" and "check-ins" — a one-character difference carrying the
    // entire scope.
    const one = phrase('set:gad-7', 'check-in')
    const everything = phrase('all-assessments', 'check-ins')
    assert.notEqual(one, everything)
    assert.equal(one, 'Anxiety check-in')
    assert.equal(everything, 'all your check-ins')
  })

  it('names a single instrument by its catalog title, never its id', () => {
    assert.equal(phrase('phq-9', 'PHQ-9'), 'Mood: full check')
    // The warmer label is the one the catalog card shows, so the name on the
    // nudge matches the name on the screen it opens.
    assert.equal(phrase('gad-7'), 'Anxiety check-in')
  })

  it('names a set of two or three', () => {
    assert.equal(phrase('set:gad-7,sleep-4'), 'Anxiety check-in and Sleep check-in')
    assert.equal(
      phrase('set:cognition-8,dsq-nci,gad-7'),
      'Thinking & memory check-in, Nutrition check-in and Anxiety check-in',
    )
  })

  it('counts a long set rather than listing it', () => {
    assert.equal(
      phrase('set:gad-7,sleep-4,cognition-8,dsq-nci'),
      '4 of your check-ins',
    )
  })

  it('uses the domain phrase for a domain scope', () => {
    assert.equal(phrase('domain:biological'), 'your physical health check-ins')
    assert.equal(phrase('domain:psychological'), 'your mental health check-ins')
    // Spiritual rolls into social on every surface (COS-851).
    assert.equal(phrase('domain:social'), 'your social and faith check-ins')
    assert.equal(phrase('domain:spiritual'), 'your social and faith check-ins')
  })

  it('uses the health-status intake wording the picker and the push already use', () => {
    assert.equal(phrase('full-intake'), 'your Health Status questionnaire')
  })

  it('degrades to a count rather than naming SOME of a set', () => {
    // A patient told "Anxiety check-in and Sleep check-in" for a three-member
    // set finishes two and finds the request still open.
    assert.equal(phrase('set:gad-7,sleep-4,not-in-catalog'), '3 of your check-ins')
    assert.equal(phrase('set:not-in-catalog'), 'your check-in')
  })

  it('falls back to the server name for an unknown single instrument, never the id', () => {
    const out = phrase('agency-custom-7', 'Agency wellbeing survey')
    assert.equal(out, 'Agency wellbeing survey')
    // An empty/whitespace server name is as absent as undefined.
    assert.equal(phrase('agency-custom-7', '   '), 'your check-in')
    assert.ok(!phrase('agency-custom-7').includes('agency-custom-7'))
  })

  /*
   * COS-1203 — `??` DOES NOT CATCH ''.
   *
   * A recurring bug class in this repo, and it landed here: the single-
   * instrument branch was `titleOf(key) ?? fromServer ?? 'your check-in'`, so an
   * empty title short-circuited BOTH fallbacks and the function returned ''.
   * The card's titleOf is `getWarmerInstrumentLabel(def.instrumentId, def.name)`,
   * which hands back `def.name` verbatim when no warmer label exists — and
   * `def.name` can be blank. The patient read "asked you to retake " and
   * VoiceOver said "...asked you to retake . Takes about 2 minutes."
   *
   * Every string crossing into this module is now normalised once, so these are
   * per-branch, not one case.
   */
  describe('blank strings fall through every fallback (`??` does not catch \'\')', () => {
    const blankTitle = () => ''
    const spaceTitle = () => '   '

    it('single instrument: a blank TITLE falls through to the server name', () => {
      assert.equal(
        retakeAskPhrase({
          instrumentKey: 'agency-custom-7',
          titleOf: blankTitle,
          fallback: 'Agency wellbeing survey',
        }),
        'Agency wellbeing survey',
      )
      assert.equal(
        retakeAskPhrase({
          instrumentKey: 'agency-custom-7',
          titleOf: spaceTitle,
          fallback: 'Agency wellbeing survey',
        }),
        'Agency wellbeing survey',
      )
    })

    it('single instrument: blank title AND blank server name still reads as English', () => {
      assert.equal(
        retakeAskPhrase({ instrumentKey: 'phq-9', titleOf: blankTitle, fallback: '' }),
        'your check-in',
      )
      assert.equal(
        retakeAskPhrase({ instrumentKey: 'phq-9', titleOf: spaceTitle, fallback: '  ' }),
        'your check-in',
      )
    })

    it('set: a blank title is UNRESOLVED, so the set degrades to a count', () => {
      // Not "Anxiety check-in and " — naming some of a set understates the ask.
      assert.equal(
        retakeAskPhrase({
          instrumentKey: 'set:gad-7,sleep-4',
          titleOf: (id) => (id === 'gad-7' ? 'Anxiety check-in' : '   '),
        }),
        '2 of your check-ins',
      )
    })

    it('no phrase this module returns is ever blank', () => {
      for (const key of [
        '',
        '   ',
        'phq-9',
        'full-intake',
        'all-assessments',
        'domain:social',
        'set:gad-7',
        'set:gad-7,sleep-4,cognition-8,dsq-nci',
      ]) {
        const out = retakeAskPhrase({ instrumentKey: key, titleOf: spaceTitle, fallback: '  ' })
        assert.ok(out.trim().length > 0, `blank phrase for key ${JSON.stringify(key)}`)
      }
    })
  })

  /*
   * COS-1203 — the card held ['instruments-recommended'] with NO `enabled`, above
   * its own `if (!first) return null`, so every Home / plan-tab mount fetched the
   * catalog for every patient — including the majority with no pending retake and
   * `basic`-plan patients for whom the route is tier-filtered to an empty list.
   *
   * hooks/use-retake-queue.ts gates the identical query on `scope !== null`. The
   * card's equivalent question is "would the phrase even consult the catalog?",
   * which only this module can answer — so it answers it, next to the branches
   * concerned, and the drift test below holds the two together.
   */
  /*
   * COS-1203 follow-up #2 — THE FIRST FRAME MUST STILL SAY WORDS.
   *
   * Round 3 read the problem correctly and traded the wrong way. The catalog
   * query cannot start until a pending row exists (the `enabled` gate, which
   * stays), and hooks/use-retake-queue.ts leaves ITS copy of the same query
   * disabled for a bare instrument key — so for the headline COS-1197 request
   * `titleOf` returns undefined on the first render and the phrase falls to the
   * server's `instrumentDisplayName`, i.e. `scopeDisplayName()`: "check-in".
   * Round 3 held an ellipsis there instead until the title arrived.
   *
   * But the card derives FOUR surfaces from this one string — the subtitle, the
   * "What" cell, the composed card utterance, and the accessibilityLabel on
   * "Start now", the only control a screen-reader user activates. So the hold
   * did not remove a vague noun for one frame; it made the card name NOTHING for
   * the length of a network fetch, and VoiceOver read out an ellipsis.
   *
   * Readable-and-vague beats precise-or-nothing. These pin the direction at
   * RUNTIME, on the real phrase, not by grepping the card: the name slot of
   * every utterance built from this phrase has to contain real words at every
   * moment, cold cache included.
   */
  describe('COS-1203 follow-up #2 — a name still loading is readable, never an ellipsis', () => {
    /*
     * The four templates the card interpolates the phrase into, mirrored.
     *
     * `composeRetakeCardAccessibilityLabel` lives in the .tsx and cannot be
     * imported here — `node --test` strips types but not JSX, and the card pulls
     * in react-native, expo-router and react-query besides. The source-read
     * assertions further down this file are what pin the card to these exact
     * templates; these are what prove the phrase flowing through them is sayable.
     */
    const surfacesFor = (askPhrase: string): Record<string, string> => ({
      subtitle: `asked you to retake ${askPhrase}`,
      'What cell': askPhrase,
      'card utterance': `Your care team asked you to retake ${askPhrase}. Takes ~4 minutes.`,
      'Start now button': `Start ${askPhrase} now`,
    })

    /*
     * Everything in those templates that is fixed chrome. Strip it and what is
     * left is the NAME SLOT — which is the thing that has to have words in it.
     * Asserting on the raw utterance would pass on "Start … now".
     */
    const CHROME = [
      /Your care team/g,
      /asked you to retake/g,
      /Takes ~\d+ minutes?/g,
      /\bStart\b/g,
      /\bnow\b/g,
    ]
    const nameSlot = (utterance: string): string =>
      CHROME.reduce((acc, re) => acc.replace(re, ' '), utterance)
    /** A screen reader can say this. "…" / " " / "." cannot. */
    const sayable = (s: string): boolean => /[A-Za-z]{3}/.test(s)

    it('THE BUG: every surface still names something while the catalog is in flight', () => {
      // Cold cache — exactly the COS-1197 request on its first render.
      const askPhrase = retakeAskPhrase({
        instrumentKey: 'gad-7',
        titleOf: () => undefined,
        fallback: 'check-in',
      })
      for (const [surface, utterance] of Object.entries(surfacesFor(askPhrase))) {
        assert.ok(
          sayable(nameSlot(utterance)),
          `${surface} names nothing while titles load: ${JSON.stringify(utterance)}`,
        )
      }
      // And specifically the two a11y surfaces, called out because they are the
      // ones a sighted reviewer cannot see regress.
      assert.ok(sayable(nameSlot(surfacesFor(askPhrase)['card utterance'])))
      assert.ok(sayable(nameSlot(surfacesFor(askPhrase)['Start now button'])))
    })

    it('the readable fallback is the server noun that was there before round 3', () => {
      assert.equal(
        retakeAskPhrase({
          instrumentKey: 'gad-7',
          titleOf: () => undefined,
          fallback: 'check-in',
        }),
        'check-in',
      )
    })

    it('upgrades to the precise title when the catalog resolves', () => {
      // Vague first, precise second. One visible change, which is what the card
      // did before round 3 and is the acceptable half of this trade.
      assert.equal(
        retakeAskPhrase({ instrumentKey: 'gad-7', titleOf: () => undefined, fallback: 'check-in' }),
        'check-in',
      )
      assert.equal(retakeAskPhrase({ instrumentKey: 'gad-7', titleOf, fallback: 'check-in' }), 'Anxiety check-in')
    })

    it('a nameable set counts itself while it loads rather than naming nothing', () => {
      assert.equal(
        retakeAskPhrase({ instrumentKey: 'set:gad-7,sleep-4', titleOf: () => undefined }),
        '2 of your check-ins',
      )
    })

    it('no key, catalog or server name produces an unsayable phrase', () => {
      // The invariant, swept: cold catalog and warm, server noun and none.
      for (const key of [
        '',
        '   ',
        'gad-7',
        'agency-custom-7',
        'full-intake',
        'all-assessments',
        'domain:biological',
        'domain:social',
        'set:gad-7',
        'set:gad-7,sleep-4',
        'set:gad-7,sleep-4,cognition-8',
        'set:gad-7,sleep-4,cognition-8,dsq-nci',
      ]) {
        for (const titles of [titleOf, () => undefined, () => '  ']) {
          for (const fallback of ['check-in', undefined, '   ']) {
            const out = retakeAskPhrase({ instrumentKey: key, titleOf: titles, fallback })
            assert.ok(
              sayable(out),
              `unsayable phrase ${JSON.stringify(out)} for key ${JSON.stringify(key)}`,
            )
          }
        }
      }
    })

    it('exports no wordless placeholder for a future caller to reach for', () => {
      // Round 3's RETAKE_ASK_PHRASE_PENDING. The trip wire is the export list,
      // not the card, because the next reader to want a hold will import it.
      for (const [name, value] of Object.entries(retakeCopy)) {
        if (typeof value !== 'string') continue
        assert.ok(
          sayable(value),
          `${name} is an exported phrase with no words in it — see COS-1203 follow-up #2`,
        )
      }
    })
  })

  describe('retakeAskPhraseNeedsTitles', () => {
    it('is false for every key the phrase can name without the catalog', () => {
      for (const key of [
        '',
        '   ',
        'full-intake',
        'all-assessments',
        'domain:biological',
        'domain:psychological',
        'domain:social',
        'domain:spiritual',
        // Over MAX_NAMED: counted, never listed.
        'set:gad-7,sleep-4,cognition-8,dsq-nci',
      ]) {
        assert.equal(retakeAskPhraseNeedsTitles(key), false, `expected no catalog for ${key}`)
      }
    })

    it('is true for a bare instrument id and for a nameable set', () => {
      for (const key of ['phq-9', 'agency-custom-7', 'set:gad-7', 'set:gad-7,sleep-4,cognition-8']) {
        assert.equal(retakeAskPhraseNeedsTitles(key), true, `expected catalog for ${key}`)
      }
    })

    it('agrees EXACTLY with whether retakeAskPhrase calls titleOf', () => {
      // The predicate exists to turn a network fetch off. If it ever says "no"
      // for a key whose phrase does read a title, the card silently degrades to
      // "your check-in" — the vague copy COS-1202 removed.
      for (const key of [
        '',
        '   ',
        'phq-9',
        'agency-custom-7',
        'full-intake',
        'all-assessments',
        'domain:biological',
        'domain:spiritual',
        'set:gad-7',
        'set:gad-7,sleep-4',
        'set:gad-7,sleep-4,cognition-8',
        'set:gad-7,sleep-4,cognition-8,dsq-nci',
        'domain:not-a-domain',
        'set:',
      ]) {
        let consulted = false
        retakeAskPhrase({
          instrumentKey: key,
          titleOf: (id) => {
            consulted = true
            return TITLES[id]
          },
          fallback: 'check-in',
        })
        assert.equal(
          consulted,
          retakeAskPhraseNeedsTitles(key),
          `predicate disagrees with the phrase for ${JSON.stringify(key)}`,
        )
      }
    })
  })
})

/*
 * The card itself is asserted by SOURCE READ, the same way
 * retake-surfaces.test.mjs and retake-request-inbox-card-contract.test.mjs do
 * it: `node --test` has no React renderer here, and what matters is structural
 * — that the rendered copy comes from the helper rather than from a literal.
 */
describe('RetakeRequestInboxCard copy', () => {
  // Comments stripped, same as retake-request-inbox-card-contract.test.mjs:
  // the header below explains at length what the old copy WAS, and a raw
  // search would flag that explanation as the thing it warns about.
  const CARD = stripComments(
    readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '..',
        '..',
        'components',
        'health-plan',
        'retake-request',
        'RetakeRequestInboxCard.tsx',
      ),
      'utf8',
    ),
  )

  it('no longer renders the fixed "an assessment" string', () => {
    assert.ok(
      !/asked you to retake an assessment/.test(CARD),
      'the subtitle is a literal again — it cannot name the scope',
    )
  })

  it('composes the subtitle, the What cell and the a11y label from one phrase', () => {
    assert.match(CARD, /\{`asked you to retake \$\{askPhrase\}`\}/)
    assert.match(CARD, /composeRetakeCardAccessibilityLabel\(first, askPhrase\)/)
    // The "What" cell renders the phrase, not the server's scope name.
    //
    // The `}<` anchor is now narrower than it needs to be. It was carving out
    // `Start ${first.instrumentDisplayName} now` in the button's a11y label,
    // which was a legitimate use of the field at the time — COS-1203 replaced
    // that with `askPhrase` too, and the Start-button test further down this
    // file forbids `${first.instrumentDisplayName}` in ANY interpolation. The
    // anchor is kept because this assertion is about the What CELL; the blanket
    // ban lives with the test that owns it.
    assert.match(CARD, />\s*\{askPhrase\}\s*</)
    assert.ok(
      !/\{first\.instrumentDisplayName\}\s*</.test(CARD),
      'the What cell still renders the server scope name ("check-in" / "3 check-ins")',
    )
  })

  it('reads titles from the catalog query, not from a map on the card', () => {
    assert.match(CARD, /queryKey: \['instruments-recommended'\]/)
    assert.match(CARD, /getWarmerInstrumentLabel\(def\.instrumentId, def\.name\)/)
  })

  /*
   * COS-1203 — the catalog query must be GATED.
   *
   * It sits above `if (!first) return ... : null`, so without `enabled` every
   * mount of Home and the plan tab issued GET /v1/instruments/recommended for
   * every patient, the overwhelming majority of whom have no pending retake and
   * render nothing. Source-read for the same reason the rest of this card is
   * source-read: `node --test` has no renderer, react-native or react-query here
   * (see the header of retake-request-inbox-card-contract.test.mjs).
   */
  it('gates the catalog query on actually needing it', () => {
    const q = CARD.match(/useQuery\(\{[\s\S]*?queryKey: \['instruments-recommended'\][\s\S]*?\n  \}\)/)
    assert.ok(q, 'the instruments-recommended useQuery call moved or changed shape')
    assert.match(
      q[0],
      /enabled:[^\n]*retakeAskPhraseNeedsTitles\(first\.instrumentKey\)/,
      'the card fetches the catalog fleet-wide, including when it renders null',
    )
    assert.match(q[0], /enabled:\s*!!first\s*&&/, 'the gate must also require a pending row')
  })

  /*
   * COS-1203 — the ONE control a screen-reader user activates said
   * `Start ${first.instrumentDisplayName} now`, i.e. the server's
   * scopeDisplayName. VoiceOver read the new precise subtitle and then "Start
   * check-in now" / "Start 3 check-ins now". It now reads the same phrase every
   * other part of the card reads.
   */
  it('the Start button announces the named phrase, not the server scope name', () => {
    assert.match(CARD, /accessibilityLabel=\{`Start \$\{askPhrase\} now`\}/)
    assert.ok(
      !/\$\{first\.instrumentDisplayName\}/.test(CARD),
      'the Start button is announcing the server scope name again ("check-in" / "3 check-ins")',
    )
  })

  /*
   * COS-1203 follow-up #2 — the card must NOT hold the phrase behind the query.
   *
   * Round 3 derived a `titlesPending` flag from the query state and passed it to
   * `retakeAskPhrase`, which returned an ellipsis for it. The behaviour is pinned
   * at runtime above; this is the half that cannot be — that the wiring which
   * produced it is gone and the card simply renders whatever phrase it has now.
   */
  it('does not hold the phrase behind the catalog query', () => {
    assert.ok(
      !/titlesPending/.test(CARD),
      'the card is holding the ask phrase behind the catalog query again — ' +
        'that placeholder also feeds the What cell, the card utterance and the Start button label',
    )
    const memo = CARD.match(/const askPhrase = useMemo\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\)/)
    assert.ok(memo, 'the askPhrase memo moved or changed shape')
    // It re-runs when the catalog lands, which is how the vague noun upgrades to
    // the precise title instead of being waited for.
    assert.match(memo[0], /\}, \[first, instrumentsQuery\.data\]\)/)
    assert.match(memo[0], /fallback: first\.instrumentDisplayName/)
  })

  /*
   * COS-1192 — and it must stay the SUBTITLE's problem.
   *
   * A disabled-then-enabled button is exactly how the two-tap bug behaved, and
   * gating the card itself on this query would delay the whole nudge behind a
   * fetch that only supplies a noun.
   */
  it('does not gate the card or the Start button on the catalog query', () => {
    assert.ok(
      !/\bdisabled=/.test(CARD),
      'something on this card is disabled again — see COS-1192, the first tap must count',
    )
    assert.ok(
      !/titlesPending\s*(\?|&&|\))/.test(CARD),
      'titlesPending is gating a render branch; it may only feed the ask phrase',
    )
  })
})
