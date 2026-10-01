/**
 * NutritionPlanSection — Ken 2026-08-07.
 *
 * "Do you think it's worth adding an additional section to the bio part of
 * the plan that we can call 'nutritional plan or support'. I'm noticing from
 * my information how important a nutritional assessment and plan is to my and
 * all of our health. I think it is critical"
 *
 * ── PLACEMENT + SHAPE (Vishal 2026-08-10) ────────────────────────────
 * Sits BETWEEN HabitsBanner ("Routines") and MedicationsBanner on the BPS
 * surface, and deliberately copies their card shape so the three read as one
 * system: no horizontal margin (inherits the parent ScrollView's padding), a
 * tint-wash background at 1F with a 55 border, a 48pt solid-tint icon well
 * with a white glyph, a 16/700 title over a 13pt subtitle, and content
 * revealed under a hairline divider — the same `previewSection` treatment
 * MedicationsBanner uses for upcoming doses.
 *
 * Accent comes from the caller. On the BPS surface that is the THEME tint —
 * the same value HabitsBanner and MedicationsBanner actually render. Both of
 * those declare a bespoke DEFAULT_TINT (teal / green) but resolve
 * `colors?.tint ?? DEFAULT_TINT`, and the theme defines `tint`, so those
 * constants are dead fallbacks. Matching the siblings means taking the tint,
 * not inventing a third hue.
 *
 * ── THE CARD READS. IT DOES NOT BUILD (COS-1219) ──────────────────────
 * The plan is generated server-side alongside the care plan, and a nightly
 * sweeper backfills anyone missing one, so there is nothing for the patient to
 * trigger. The "Build it" card, the POST and the `nutrition-plan.generate`
 * gate are gone. `plan: null` therefore means "the care plan has not produced
 * one yet" — it is a WAITING state, and the copy for it must not imply the
 * patient can hurry it along by tapping something, because they cannot.
 *
 * The one thing they CAN do is answer the dietary screener, which is what the
 * generator reads. A 409 "screener not taken" is no longer reachable (only the
 * POST returned it; the GET answers 200 with a null plan either way), so the
 * null state absorbs that case by offering the screener alongside an honest
 * statement that an already-answered screener needs nothing further.
 *
 * ── ACCEPTED SUGGESTIONS BECOME ROUTINES, NOT TASKS (COS-1219) ────────
 * Tasks are wiped on every care-plan regeneration — `mergeEditedPatientTasks`
 * is referenced in four comments and does not exist, and all 225 production
 * tasks are source:'ai'. Routines survive: care-plan-normalizer merges them,
 * and they have patient CRUD plus per-day completion. A suggestion the patient
 * accepted must outlive the next regeneration, so it goes to routines.
 *
 * `suggestion.domain` is handed straight to `UpsertHabitInput.bpsDomain`:
 * identical four-value vocabulary, no mapping, and typed as the same thing in
 * services/api/nutrition-plan.ts so the compiler keeps it that way.
 *
 * ── THE CARD MAY NOT CLAIM WHAT IT DOES NOT KNOW (COS-1224) ───────────
 * "Already added" is derived from the routines on the AI health plan. That
 * plan's fetcher swallows its own errors and resolves to `null`, so a failed
 * GET is indistinguishable from "no plan" and arrives as `habits: []` — which
 * the card used to read as "nothing is on your plan". Result: every suggestion
 * the patient had already accepted offered "Add to my plan" again, and the
 * second tap minted a duplicate routine.
 *
 * So the derived set is `Set | null`, null meaning NOT KNOWN, and the row has a
 * third answer: it says it cannot tell, and offers nothing. "Add to my plan" is
 * a claim, and a wrong claim here costs the patient a duplicate.
 *
 * Three rows, three sources, in strict order: the plan (authoritative), the
 * latch (a real 200 the plan has not caught up with), then the add offer. No
 * local state may outlive the plan's answer — see lib/add-latch.ts.
 *
 * ── WHAT THIS MUST NOT IMPLY ─────────────────────────────────────────
 * The screener yields FREQUENCIES ("how often"), never amounts — the NCI
 * regression coefficients that convert frequency to intake are not loaded
 * (see cos-backend/src/services/nutrition/dsq-scoring.service.ts). So the
 * copy never states a quantity, and the care-team-review notice is neither
 * dismissible nor conditional: Ken's own source on AI in nutrition found LLM
 * diet plans show "variability in accuracy, safety, and personalization,
 * indicating the need for professional oversight."
 *
 * iOS 26.5-safe primitive envelope (View / Text / Pressable /
 * MaterialIcons / StyleSheet). Deliberately NO ActivityIndicator:
 * BiopsychosocialPlanScreen, which is what renders this card in production,
 * records that ActivityIndicator was scrubbed from these surfaces (chunk
 * 46.1) and that the sanctioned pending affordance is static.
 */

import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'

import {
  fetchNutritionPlan,
  NutritionFeatureDisabledError,
  NutritionEntitlementError,
  type NutritionPlan,
} from '@/services/api/nutrition-plan'
import {
  EMPTY_LATCH,
  HABIT_LABEL_MAX,
  HABIT_RATIONALE_MAX,
  addFailureState,
  clampAtWord,
  isOnPlan,
  latchAdd,
  nextLatchExpiry,
  settleLatch,
  type AddLatch,
  type AddRowState,
} from '@/lib/add-latch'
import { useCanRender } from '@/hooks/use-entitlement'
import { useAddHabit, useHabitsInPlanFlag, usePlanHabits } from '@/hooks/use-plan-habits'

/** Fallback only — every real caller passes the theme tint. Amber rather
 *  than a teal/green guess so an unstyled render is obvious in review. */
const DEFAULT_TINT = '#D97706'
const DEFAULT_TEXT = '#11181C'
const DEFAULT_SUBTEXT = '#687076'

/** Where the patient edits routines, including adding their own. */
const ROUTINES_ROUTE = '/Home/habits'

export interface NutritionPlanSectionProps {
  colors?: Partial<{ card: string; border: string; text: string; subtext: string; tint: string }>
  getScaledFontSize?: (n: number) => number
  getScaledFontWeight?: (n: number) => string
  /** Sends the patient to the dietary screener, which the generator reads. */
  onTakeScreener: () => void
  containerStyle?: StyleProp<ViewStyle>
}

type Status =
  /** The stored-plan read is in flight. */
  | { kind: 'loading' }
  | { kind: 'ready'; plan: NutritionPlan }
  /** 200 with no plan yet — the care plan has not produced one. */
  | { kind: 'empty' }
  | { kind: 'error' }
  /** Feature off or not entitled — the section renders nothing at all. */
  | { kind: 'hidden' }

const FACTOR_LABEL: Record<string, string> = {
  fruits: 'Fruit',
  vegetables: 'Vegetables',
  fruitsAndVegetables: 'Fruit & vegetables',
  wholeGrains: 'Whole grains',
  addedSugars: 'Added sugars',
  sugarSweetenedBeverages: 'Sugary drinks',
  dairy: 'Dairy',
  fibre: 'Fibre',
  calcium: 'Calcium',
  redAndProcessedMeat: 'Red & processed meat',
}

/** Loose match so trivial punctuation/case drift does not read as a new item. */
function normalizeTitle(t: string): string {
  return t.trim().toLowerCase().replace(/[\s.,!—–-]+/g, ' ')
}

export function NutritionPlanSection({
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  onTakeScreener,
  containerStyle,
}: NutritionPlanSectionProps): React.ReactElement | null {
  const canViewNutritionPlan = useCanRender('nutrition-plan.view')
  /**
   * Are routines actually available? `habits_in_plan_enabled` is true in
   * production, but when it is not the routines routes 404 — and an "Add to my
   * plan" button that cannot add anything is the exact failure Ken reported
   * about reminder bells. Flag off ⇒ the suggestions still read, nothing
   * offers to save them.
   */
  const routinesLive = useHabitsInPlanFlag()
  /**
   * `known` is not optional here. The card's entire "already added" answer is
   * derived from these routines, and `habits` is `[]` both when the patient has
   * none and when the plan read did not land — `fetchAiHealthPlan` swallows its
   * own errors and resolves to null, so nothing else reports the difference
   * (COS-1224).
   */
  const { habits, known: planKnown } = usePlanHabits()
  const addHabit = useAddHabit()

  const [status, setStatus] = React.useState<Status>({ kind: 'loading' })
  /**
   * Vishal 2026-08-11: "this card needs to be an accordion".
   *
   * Collapsed shows the title row only. Everything else — the subtitle, the
   * suggestions, the add affordances and the review notice — lives in the
   * body, so the card costs one line in the stack until someone asks for it.
   */
  const [open, setOpen] = React.useState(false)
  /**
   * Rows mid-flight or failed, keyed by suggestion index within the CURRENT
   * plan. Every member of AddRowState means NOT ADDED — "already added" is not
   * in here and must never be: a local flag meaning added, sitting beside the
   * derived answer, is the 2026-08-11 "on your plan forever" bug.
   */
  const [pending, setPending] = React.useState<Record<number, AddRowState>>({})
  /**
   * Taps already in flight, by row. `pending` is state, so two taps landing in
   * the same commit both read `pending[i] === undefined` and both POST — the
   * server then mints two routines (COS-1224). A ref is written synchronously,
   * so the second tap sees the first.
   */
  const inFlight = React.useRef<Set<number>>(new Set())
  /**
   * The flicker fix (COS-1220). Holds a successful add until the plan cache
   * actually contains it, then releases so the plan — which reverts correctly
   * on delete — owns the answer. See lib/add-latch.ts for both bugs this sits
   * between; the logic is pure and tested there.
   */
  const [latch, setLatch] = React.useState<AddLatch>(EMPTY_LATCH)

  /**
   * What is on the plan already, normalised, derived from the ROUTINES the
   * plan carries rather than from local state — local state resets on every
   * app launch, which meant an accepted suggestion offered "Add to my plan"
   * again and tapping it created a duplicate.
   *
   * `null` when the plan is not known, which is a DIFFERENT answer from the
   * empty set and the whole of COS-1224 MAJOR 1: an empty set says "nothing is
   * on your plan", and reading a failed plan GET that way is what put "Add to
   * my plan" under items the patient had already added.
   */
  const onPlanLabels = React.useMemo(
    () => (planKnown ? new Set(habits.map((h) => normalizeTitle(h.label))) : null),
    [habits, planKnown],
  )

  // Release latches the plan has caught up with. Keyed on the derived set,
  // whose identity changes on most renders — settleLatch returns the same
  // object when there is nothing to release, which is what keeps this from
  // looping.
  React.useEffect(() => {
    setLatch((prev) => settleLatch(prev, onPlanLabels, Date.now()))
  }, [onPlanLabels])

  /**
   * Give the TTL a clock.
   *
   * `now` below is read in the render body, so without this LATCH_TTL_MS only
   * took effect on the next incidental re-render — and in the single case the
   * TTL exists for (confirmation never arrives) nothing else re-renders this
   * card, so the documented ceiling was not one. One timeout at the earliest
   * expiry; settleLatch then drops the key, which is itself the re-render.
   *
   * nextLatchExpiry returns null while the plan is unknown — the latch is
   * suspended then, not ticking — so no timer is armed and nothing spins.
   */
  React.useEffect(() => {
    const due = nextLatchExpiry(latch, onPlanLabels)
    if (due === null) return
    const timer = setTimeout(
      () => setLatch((prev) => settleLatch(prev, onPlanLabels, Date.now())),
      Math.max(0, due - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [latch, onPlanLabels])

  /**
   * Read the stored plan. One DynamoDB read, no generation — there is no
   * generation path in the app any more.
   */
  const load = React.useCallback(async () => {
    try {
      const plan = await fetchNutritionPlan()
      setPending({})
      setStatus(
        plan && plan.suggestions.length > 0 ? { kind: 'ready', plan } : { kind: 'empty' },
      )
    } catch (err) {
      if (err instanceof NutritionFeatureDisabledError || err instanceof NutritionEntitlementError) {
        // Collapse silently. A patient whose plan does not include this
        // should not see a broken card, and neither should anyone when the
        // backend flag is off.
        setStatus({ kind: 'hidden' })
        return
      }
      setStatus({ kind: 'error' })
    }
  }, [])

  /**
   * Accept a suggestion: it becomes a ROUTINE.
   *
   * cadence 'daily' — the screener asks how often food is eaten, and every
   * suggestion it drives is a daily eating pattern; a weekly routine would
   * under-describe "have a vegetable with lunch".
   *
   * scheduledTime '11:00' — late morning. Early enough to act on at lunch,
   * late enough to stay out of the pre-breakfast cluster of medication
   * reminders. A time is what places the routine on Today's Schedule, which
   * is the integration Ken asked for; without one it falls into "Anytime".
   *
   * remindersEnabled false — explicitly, because absent reads as TRUE on the
   * backend. The patient chose to TRACK this, not to be buzzed about it, and
   * they did not pick the hour we just picked for them. They can switch it on
   * in the routines editor, where the toggle already lives.
   */
  const onAddToPlan = React.useCallback(
    async (index: number, suggestion: NutritionPlan['suggestions'][number]) => {
      // Synchronous double-tap guard — see `inFlight`.
      if (inFlight.current.has(index)) return
      inFlight.current.add(index)
      setPending((p) => ({ ...p, [index]: 'saving' }))
      try {
        await addHabit.mutateAsync({
          // COS-1224 — the ROUTINE schema's limits, not the task schema's.
          // plan-habits.routes.ts createHabitSchema caps label at 60 and
          // rationale at 200; this used to send slice(0, 120) and an uncapped
          // rationale, both shaped for createPlanTask. A nutrition title is
          // specified at <=100 chars and a rationale is prose, so a perfectly
          // legal suggestion 400'd on the one action this card exists for.
          label: clampAtWord(suggestion.title, HABIT_LABEL_MAX),
          cadence: 'daily',
          scheduledTime: '11:00',
          remindersEnabled: false,
          // Straight through. Same four values, no mapping, no default.
          bpsDomain: suggestion.domain,
          rationale: clampAtWord(suggestion.rationale, HABIT_RATIONALE_MAX),
        })
        // Latch FIRST, then clear 'saving'. The row must never be between the
        // two — that gap is what rendered "Add to my plan" for a second.
        setLatch((prev) => latchAdd(prev, normalizeTitle(suggestion.title), Date.now()))
        setPending((p) => {
          const next = { ...p }
          delete next[index]
          return next
        })
      } catch (err) {
        // Deliberately not surfacing the raw error on the row — the card is a
        // summary surface. But "tap to retry" on a failure that can never
        // succeed is worse than silence, so the two unretryable backend codes
        // get their own state and their own copy (COS-1224).
        setPending((p) => ({ ...p, [index]: addFailureState(err) }))
      } finally {
        inFlight.current.delete(index)
      }
    },
    [addHabit],
  )

  React.useEffect(() => {
    void load()
  }, [load])

  /**
   * The latest status, for the focus handler below.
   *
   * That handler must NOT close over `status`: useFocusEffect re-runs its
   * callback whenever the identity changes while the screen is focused, so
   * depending on the status would make "re-read when empty" fire a second read
   * every time the first one resolved.
   */
  const statusRef = React.useRef<Status>(status)
  React.useEffect(() => {
    statusRef.current = status
  }, [status])

  // Re-read when the screen regains focus.
  //
  // Vishal 2026-08-10: after completing the screener the card still read
  // "Take the dietary screener", and tapping it re-opened the finished
  // stepper on its "nicely done" screen. `status` is local state, so once it
  // landed it stayed there — returning from the screener does not remount.
  //
  // Only 'empty' and 'error' re-read. 'ready' is left alone so a loaded plan
  // is not replaced by a flash of loading state, and 'loading' is left alone
  // so a focus event mid-request cannot fire a second read. One DynamoDB read
  // per focus on an empty card is the cheapest thing on this screen.
  useFocusEffect(
    React.useCallback(() => {
      const kind = statusRef.current.kind
      if (kind === 'empty' || kind === 'error') void load()
      // Returning to the card is the one signal that the patient may have acted
      // on what a 'capped' or 'no-plan' row told them to go and do. Both of those
      // rows deliberately offer no retry (COS-1224), so without this the advice
      // leads nowhere: make room in Routines, come back, and the row still says
      // the plan is full. Dropping them offers the add again. Identity is
      // returned untouched when there is nothing stuck, so this costs no render.
      setPending((p) => {
        const next: Record<number, AddRowState> = {}
        let changed = false
        for (const [k, v] of Object.entries(p)) {
          if (v === 'capped' || v === 'no-plan') changed = true
          else next[Number(k)] = v
        }
        return changed ? next : p
      })
    }, [load]),
  )

  if (!canViewNutritionPlan) return null
  if (status.kind === 'hidden') return null

  const tint = colors?.tint ?? DEFAULT_TINT
  const text = colors?.text ?? DEFAULT_TEXT
  const subtext = colors?.subtext ?? DEFAULT_SUBTEXT
  const sz = getScaledFontSize ?? ((n: number) => n)
  const wt = getScaledFontWeight ?? ((n: number) => String(n))
  const bold = wt(700) as never
  const now = Date.now()

  // One subtitle per state, so the card always reads as the same row in the
  // stack rather than changing shape underneath the patient.
  let subtitle = 'Checking for your latest plan…'
  if (status.kind === 'empty') {
    subtitle =
      'Nothing here yet. Your nutrition plan is prepared with your care plan — there is nothing for you to build.'
  } else if (status.kind === 'error') {
    subtitle = 'Could not load your nutrition plan just now.'
  } else if (status.kind === 'ready') {
    subtitle =
      status.plan.summary !== ''
        ? status.plan.summary
        : `${status.plan.suggestions.length} suggestions from your screener.`
  }

  const isReady = status.kind === 'ready'

  return (
    <View style={[styles.card, { backgroundColor: `${tint}1F`, borderColor: `${tint}55` }, containerStyle]}>
      {/* Header row IS the accordion toggle. */}
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="Nutrition plan and support"
        accessibilityHint={open ? 'Tap to collapse' : 'Tap to expand'}
        hitSlop={4}
        style={styles.headerRow}
      >
        <View
          style={[styles.iconWrap, { backgroundColor: tint, borderColor: tint }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <MaterialIcons name="restaurant" size={24} color="#FFFFFF" />
        </View>

        <View style={styles.textCol}>
          <Text style={{ color: text, fontSize: sz(16), fontWeight: bold }} numberOfLines={1}>
            Nutrition plan &amp; support
          </Text>
        </View>

        {/* Vishal 2026-08-11: "reload icon is not required on nutrition".
            The chevron is the accordion affordance and the only one — there
            is nothing to rebuild from here any more. */}
        <MaterialIcons
          name={open ? 'expand-less' : 'expand-more'}
          size={sz(22)}
          color={subtext}
        />
      </Pressable>

      {open && (
        <View style={[styles.body, { borderTopColor: `${tint}44` }]}>
          <Text style={{ color: subtext, fontSize: sz(13), lineHeight: 18 }}>
            {subtitle}
          </Text>

          {status.kind === 'loading' && (
            <View style={styles.loadingRow}>
              <MaterialIcons name="sync" size={sz(16)} color={tint} />
              <Text style={{ color: subtext, fontSize: sz(13), marginLeft: 8 }}>
                Looking for your plan…
              </Text>
            </View>
          )}

          {/* The null state. It must not imply a tap would produce a plan —
              nothing the patient does here generates one. The screener is the
              only input they control, and the second sentence says plainly
              that an already-answered screener needs nothing further, so this
              never reads as a chore for someone who has already done it. */}
          {status.kind === 'empty' && (
            <View style={styles.emptyBlock}>
              <Text style={{ color: subtext, fontSize: sz(12), lineHeight: 17 }}>
                It is written from your dietary screener answers. If you have not answered
                those yet, that is the one thing that gets it started. If you have, it will
                appear here after your next care-plan update — nothing else is needed from
                you.
              </Text>
              <Pressable
                onPress={onTakeScreener}
                accessibilityRole="button"
                accessibilityLabel="Take or update the dietary screener"
                accessibilityHint="Opens the dietary screener"
                hitSlop={8}
                style={styles.linkRow}
              >
                <MaterialIcons name="assignment" size={sz(14)} color={tint} />
                <Text style={{ color: tint, fontSize: sz(13), fontWeight: bold, marginLeft: 6 }}>
                  Take or update the dietary screener
                </Text>
              </Pressable>
              <Text style={{ color: subtext, fontSize: sz(12), lineHeight: 17 }}>
                A short food-frequency questionnaire — about 5 minutes.
              </Text>
            </View>
          )}

          {status.kind === 'error' && (
            <Pressable
              onPress={() => void load()}
              accessibilityRole="button"
              accessibilityLabel="Try loading your nutrition plan again"
              hitSlop={8}
              style={styles.linkRow}
            >
              <MaterialIcons name="refresh" size={sz(14)} color={tint} />
              <Text style={{ color: tint, fontSize: sz(13), fontWeight: bold, marginLeft: 6 }}>
                Try again
              </Text>
            </Pressable>
          )}

          {isReady && (
            <View style={styles.previewSection}>
          {status.plan.suggestions.map((s, i) => (
            <View key={`${s.factor}-${i}`} style={styles.previewRow}>
              <View style={[styles.dot, { backgroundColor: tint, borderColor: tint }]} />
              <View style={styles.previewText}>
                <Text style={{ color: text, fontSize: sz(14), fontWeight: bold, lineHeight: 19 }}>
                  {s.title}
                </Text>
                <Text style={{ color: subtext, fontSize: sz(12), lineHeight: 17, marginTop: 2 }}>
                  {FACTOR_LABEL[s.factor] ?? s.factor}
                  {s.rationale !== '' ? ` · ${s.rationale}` : ''}
                </Text>

                {/* Turn the suggestion into something the patient can
                    actually tick off. Without this the card is read-only
                    advice that vanishes on the next regeneration. */}
                {isOnPlan(normalizeTitle(s.title), latch, onPlanLabels, now) ? (
                  /* The row NAMES Routines, so the row has to get them there
                     (COS-1224). It used to be a plain View, and the only
                     navigation on the card was the "Add your own" link at the
                     bottom — a patient told where their item went had no way to
                     go and look at it. Same destination as that link. */
                  <Pressable
                    onPress={() => router.push(ROUTINES_ROUTE as never)}
                    accessibilityRole="button"
                    accessibilityLabel={`"${s.title}" is on your plan, in Routines`}
                    accessibilityHint="Opens Routines, where this one now lives"
                    hitSlop={8}
                    style={styles.addedRow}
                  >
                    <MaterialIcons name="check-circle" size={sz(14)} color={tint} />
                    <Text style={{ color: tint, fontSize: sz(12), fontWeight: bold, marginLeft: 4 }}>
                      On your plan — in Routines
                    </Text>
                    <MaterialIcons name="chevron-right" size={sz(16)} color={tint} />
                  </Pressable>
                ) : onPlanLabels === null ? (
                  /* The plan did not load, so this card genuinely does not know
                     whether the patient already added this. "Add to my plan" is
                     a confident claim and would be wrong half the time — and a
                     tap on it mints a duplicate. So say what is true and offer
                     nothing.

                     It corrects itself the next time the ai-health-plan query
                     succeeds, which is a screen remount or any habit write's
                     invalidate. NOT this screen's pull-to-refresh: that refetches
                     the biopsychosocial plan, a different query. So the row can
                     stay unsure for the rest of the session on a connection that
                     never comes back — honest, and still better than a confident
                     wrong answer, but it is why it reads "not sure YET". */
                  <View style={styles.addedRow}>
                    <MaterialIcons name="cloud-off" size={sz(14)} color={subtext} />
                    <Text style={{ color: subtext, fontSize: sz(12), marginLeft: 4, flex: 1 }}>
                      Not sure yet whether this is on your plan
                    </Text>
                  </View>
                ) : routinesLive ? (
                  pending[i] === 'capped' || pending[i] === 'no-plan' ? (
                    /* Neither of these can succeed on a second tap, so neither
                       gets a retry affordance — a plain, non-interactive line
                       that says what actually happened (COS-1224). */
                    <View style={styles.addedRow}>
                      <MaterialIcons name="info-outline" size={sz(14)} color={subtext} />
                      <Text
                        style={{ color: subtext, fontSize: sz(12), lineHeight: 17, marginLeft: 4, flex: 1 }}
                      >
                        {pending[i] === 'capped'
                          ? 'Your plan already holds as many routines as it can. Remove one in Routines to make room for this.'
                          : 'Your care plan is not ready yet, so there is nowhere to put this one.'}
                      </Text>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => void onAddToPlan(i, s)}
                      disabled={pending[i] === 'saving'}
                      accessibilityRole="button"
                      accessibilityLabel={`Add "${s.title}" to my plan`}
                      accessibilityHint="Adds a daily routine you can tick off"
                      hitSlop={8}
                      style={styles.addBtn}
                    >
                      <MaterialIcons
                        name={pending[i] === 'failed' ? 'refresh' : 'add-circle-outline'}
                        size={sz(14)}
                        color={tint}
                      />
                      <Text style={{ color: tint, fontSize: sz(12), fontWeight: bold, marginLeft: 4 }}>
                        {pending[i] === 'saving'
                          ? 'Adding…'
                          : pending[i] === 'failed'
                            ? "Couldn't add — tap to retry"
                            : 'Add to my plan'}
                      </Text>
                    </Pressable>
                  )
                ) : null}
              </View>
            </View>
          ))}

          {/* NOT dismissible, and not conditional on anything the model
              returns. Dietary guidance interacts with medication and with
              conditions this generator cannot see. */}
          {status.plan.requiresCareTeamReview && (
            <View style={styles.reviewNote}>
              <MaterialIcons name="info-outline" size={sz(13)} color={subtext} />
              <Text
                style={{ color: subtext, fontSize: sz(12), lineHeight: 17, marginLeft: 6, flex: 1 }}
              >
                Based on what you reported eating — how often, not how much. Your
                care team reviews these before they become advice. Talk to them
                before making changes, especially if you take medication.
              </Text>
            </View>
          )}
            </View>
          )}

          {/* The patient's own item (COS-1220). Routes to the routines editor
              rather than growing a second one in here: that screen already has
              the Body / Mind / Social / Spiritual picker, so an entry made
              there carries a domain exactly as an accepted suggestion does.
              ponytail: a link, not an inline form — the form exists. */}
          {routinesLive && (
            <Pressable
              onPress={() => router.push(ROUTINES_ROUTE as never)}
              accessibilityRole="button"
              accessibilityLabel="Add your own nutrition routine"
              accessibilityHint="Opens Routines, where you can add one of your own"
              hitSlop={8}
              style={styles.linkRow}
            >
              <MaterialIcons name="add" size={sz(14)} color={tint} />
              <Text style={{ color: tint, fontSize: sz(13), fontWeight: bold, marginLeft: 6 }}>
                Add your own
              </Text>
            </Pressable>
          )}
          {routinesLive && (
            <Text style={{ color: subtext, fontSize: sz(12), lineHeight: 17 }}>
              Opens Routines, where you name it and choose which part of your plan it
              belongs to.
            </Text>
          )}
        </View>
      )}
    </View>
  )
}

// Shape copied from MedicationsBanner so the three banners read as one
// system. Notably NO marginHorizontal — the parent ScrollView owns the
// horizontal padding, which is what keeps all three byte-width-matched.
const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
    // Keeps the whole card a comfortable target even in its shortest state.
    minHeight: 44,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  body: { marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, minHeight: 44 },
  emptyBlock: { marginTop: 10 },
  // 44pt target on a compact inline affordance comes from hitSlop rather
  // than height, so the rows stay tight.
  linkRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingVertical: 4 },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textCol: { flex: 1, marginRight: 8 },
  previewSection: { marginTop: 4 },
  previewRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 5 },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, marginRight: 10, marginTop: 6 },
  previewText: { flex: 1 },
  reviewNote: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 10 },
  addBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 6, paddingVertical: 4 },
  addedRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, paddingVertical: 4 },
})
