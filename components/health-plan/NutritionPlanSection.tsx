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
 * ── GENERATE ON TAP, NOT ON MOUNT ────────────────────────────────────
 * Each generation is a Bedrock call and the backend does not persist the
 * result, so fetching on render would bill a model call for every patient who
 * scrolls past. Tapping the card is what generates.
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
import { useFocusEffect } from 'expo-router'

import {
  generateNutritionPlan,
  fetchNutritionPlan,
  NutritionFeatureDisabledError,
  NutritionEntitlementError,
  NutritionScreenerRequiredError,
  NutritionGenerationError,
  type NutritionPlan,
} from '@/services/api/nutrition-plan'
import { createPlanTask } from '@/services/api/plan-tasks'
import { todayLocalIso } from '@/lib/day-key';
import { useCanRender } from '@/hooks/use-entitlement'

/** Fallback only — every real caller passes the theme tint. Amber rather
 *  than a teal/green guess so an unstyled render is obvious in review. */
const DEFAULT_TINT = '#D97706'
const DEFAULT_TEXT = '#11181C'
const DEFAULT_SUBTEXT = '#687076'

export interface NutritionPlanSectionProps {
  colors?: Partial<{ card: string; border: string; text: string; subtext: string; tint: string }>
  getScaledFontSize?: (n: number) => number
  getScaledFontWeight?: (n: number) => string
  /** Sends the patient to the assessments catalog to take the screener. */
  onTakeScreener: () => void
  containerStyle?: StyleProp<ViewStyle>
  /**
   * Titles of the tasks already on the patient's plan.
   *
   * The "already added" mark is derived from THIS, not from local state.
   * Local state resets on every app launch, which meant a suggestion the
   * patient had already added showed "Add to my plan" again — and tapping it
   * created a duplicate task.
   */
  existingTaskTitles?: readonly string[]
  /**
   * Called after a task is created, with the new task's id, so the parent can
   * refetch the plan and then show the patient WHERE it landed.
   */
  onTaskAdded?: (taskId: string) => void | Promise<void>
}

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; plan: NutritionPlan }
  | { kind: 'needs-screener'; code: 'SCREENER_NOT_TAKEN' | 'SCREENER_INCOMPLETE' }
  | { kind: 'error'; message: string; retryable: boolean }
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

/** Loose match so trivial punctuation/case drift does not read as a new task. */
function normalizeTitle(t: string): string {
  return t.trim().toLowerCase().replace(/[\s.,!—–-]+/g, ' ')
}

export function NutritionPlanSection({
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  onTakeScreener,
  containerStyle,
  existingTaskTitles,
  onTaskAdded,
}: NutritionPlanSectionProps): React.ReactElement | null {
  const canViewNutritionPlan = useCanRender('nutrition-plan.view')
  const canGenerateNutritionPlan = useCanRender('nutrition-plan.generate')
  const [status, setStatus] = React.useState<Status>({ kind: 'idle' })
  /**
   * Vishal 2026-08-11: "this card needs to be an accordion".
   *
   * Collapsed shows the title row only. Everything else — the subtitle, the
   * build action, the suggestions and the review notice — lives in the body,
   * so the card costs one line in the stack until someone asks for it.
   */
  const [open, setOpen] = React.useState(false)
  /**
   * Which suggestions the patient has turned into plan tasks, and which are
   * mid-flight. Keyed by suggestion index within the CURRENT plan — a
   * rebuild replaces the suggestions wholesale, so this is reset there.
   */
  const [added, setAdded] = React.useState<Record<number, 'saving' | 'done' | 'failed'>>({})

  /** Titles already on the plan, normalised. Survives app restarts because
   *  it comes from the plan, not from this component. */
  const existing = React.useMemo(
    () => new Set((existingTaskTitles ?? []).map(normalizeTitle)),
    [existingTaskTitles],
  )

  const onGenerate = React.useCallback(async () => {
    setStatus({ kind: 'loading' })
    setAdded({})
    try {
      const plan = await generateNutritionPlan()
      setStatus({ kind: 'ready', plan })
    } catch (err) {
      if (err instanceof NutritionFeatureDisabledError || err instanceof NutritionEntitlementError) {
        // Collapse silently. A patient whose plan does not include this
        // should not see a broken card, and neither should anyone when the
        // backend flag is off.
        setStatus({ kind: 'hidden' })
        return
      }
      if (err instanceof NutritionScreenerRequiredError) {
        setStatus({ kind: 'needs-screener', code: err.code })
        return
      }
      if (err instanceof NutritionGenerationError) {
        setStatus({ kind: 'error', message: err.message, retryable: true })
        return
      }
      setStatus({
        kind: 'error',
        message: 'Could not build your nutrition plan right now. Tap to try again.',
        retryable: true,
      })
    }
  }, [])

  /**
   * Turn a suggestion into a real plan task.
   *
   * Vishal 2026-08-10: "how patients will be able to track it or update any
   * activity". Plan tasks are the answer, and specifically NOT routines —
   * the routines API is behind `plan_routines_enabled`, which is unset in
   * production, and it has no completion endpoint at all (five routes: POST,
   * GET, GET/:id, PATCH/:id, DELETE/:id). Nothing references routineId in any
   * completion or streak path.
   *
   * Plan tasks already have the whole loop live in production: complete/skip
   * endpoints, getTaskAnalytics (completion rate, on-time rate, streaks), and
   * Daily Read's taskCompletion pillar reads it. Once a suggestion is a task
   * the patient can tick it off, edit it, or delete it with the controls they
   * already use, and patient-override (on in prod) preserves it across plan
   * regenerations.
   *
   * type is 'reminder': the enum is medication|exercise|appointment|reminder
   * and a dietary change is none of the first three.
   */
  const onAddToPlan = React.useCallback(
    async (index: number, suggestionTitle: string, rationale: string) => {
      setAdded((p) => ({ ...p, [index]: 'saving' }))
      try {
        const created = await createPlanTask({
          type: 'reminder',
          title: suggestionTitle.slice(0, 120),
          description: rationale,
          // Late morning: early enough to act on at lunch, late enough not to
          // land in the pre-breakfast cluster of medication reminders.
          scheduledTime: '11:00',
          recurrence: 'daily',
          startDate: todayLocalIso(),
          category: 'nutrition',
          completionStyle: 'simple',
        })
        setAdded((p) => ({ ...p, [index]: 'done' }))
        // Hand the id up so the parent can refetch, scroll to the section the
        // task landed in, open its Tasks accordion and flash the new row.
        //
        // Vishal 2026-08-11: "we are not giving user any info where its
        // added". Showing beats telling — a modal would explain the
        // destination; this reveals it.
        await onTaskAdded?.(created.id)

        // Then DROP the local flag and let `existingTaskTitles` own the
        // answer from here on.
        //
        // Vishal 2026-08-11: "once deleted routines is still saying on your
        // plan". The local 'done' was OR'd with the derived check forever, so
        // deleting the task cleared it from the plan but not from this card.
        // The parent has refetched by now, so the title is in `existing` and
        // the row still reads "On your plan" — but via the source of truth,
        // which also means it correctly reverts to "Add to my plan" when the
        // task is deleted.
        setAdded((p) => {
          const next = { ...p }
          delete next[index]
          return next
        })
      } catch {
        // Deliberately not surfacing the raw error on the row — the card is
        // a summary surface. 'failed' renders a retry affordance in place.
        setAdded((p) => ({ ...p, [index]: 'failed' }))
      }
    },
    [onTaskAdded],
  )

  /**
   * Load the STORED plan on mount.
   *
   * This is a DynamoDB read, not a generation — no Bedrock call — so it is
   * safe on mount in a way `onGenerate` is not. Without it, every app open
   * showed the build prompt again and a tap re-generated from scratch, which
   * is what "again loader and then task" describes.
   *
   * Silent on every failure: a missing plan, a disabled flag or a network
   * blip all leave the card in its idle build state, which is the honest
   * fallback. Errors here must not render, because the patient did not ask
   * for anything yet.
   */
  React.useEffect(() => {
    let cancelled = false
    void fetchNutritionPlan()
      .then((plan) => {
        if (cancelled || !plan || plan.suggestions.length === 0) return
        setStatus((prev) => (prev.kind === 'idle' ? { kind: 'ready', plan } : prev))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  // Re-check when the screen regains focus.
  //
  // Vishal 2026-08-10: after completing the screener the card still read
  // "Take the dietary screener", and tapping it re-opened the finished
  // stepper on its "nicely done" screen. Cause: `status` is local state, so
  // once it landed on needs-screener it stayed there — returning from the
  // screener does not remount this component.
  //
  // Only 'needs-screener' and 'error' are reset. 'ready' is left alone so a
  // generated plan is not wiped by tabbing away and back, and 'loading' is
  // left alone so a focus event mid-request cannot strand the spinner.
  //
  // This deliberately does NOT auto-generate — that would be a Bedrock call
  // on every focus. It returns the card to its tappable idle state.
  useFocusEffect(
    React.useCallback(() => {
      setStatus((prev) =>
        prev.kind === 'needs-screener' || prev.kind === 'error'
          ? { kind: 'idle' }
          : prev,
      )
    }, []),
  )

  if (!canViewNutritionPlan) return null
  if (status.kind === 'hidden') return null

  const tint = colors?.tint ?? DEFAULT_TINT
  const text = colors?.text ?? DEFAULT_TEXT
  const subtext = colors?.subtext ?? DEFAULT_SUBTEXT
  const sz = getScaledFontSize ?? ((n: number) => n)
  const wt = getScaledFontWeight ?? ((n: number) => String(n))
  const bold = wt(700) as never

  // Title + subtitle per state, so the card always reads as the same row in
  // the stack rather than changing shape underneath the patient.
  let title = 'Nutrition plan & support'
  let subtitle = 'Build practical suggestions from your dietary screener.'
  let onPress: () => void = () => void onGenerate()
  let a11yHint = 'Builds suggestions from your dietary screener'

  if (status.kind === 'loading') {
    subtitle = 'Building your plan…'
    onPress = () => undefined
    a11yHint = 'Building your nutrition plan'
  } else if (status.kind === 'needs-screener') {
    // The two 409 codes mean different things and must not share copy.
    // Telling someone to "take" a screener they already took is how you get
    // sent in a circle. The backend's own message just repeats the title, so
    // the subtitle says what the thing IS / what is still needed instead.
    const notTaken = status.code === 'SCREENER_NOT_TAKEN'
    title = notTaken ? 'Take the dietary screener' : 'Finish the dietary screener'
    subtitle = notTaken
      ? 'A short food-frequency questionnaire — about 5 minutes. Your plan is built from it.'
      : 'A few more answers needed before we can build your plan.'
    onPress = onTakeScreener
    a11yHint = 'Opens the dietary screener'
  } else if (status.kind === 'error') {
    subtitle = status.message
    a11yHint = 'Tap to try again'
  } else if (status.kind === 'ready') {
    subtitle =
      status.plan.summary !== ''
        ? status.plan.summary
        : `${status.plan.suggestions.length} suggestions from your screener.`
    onPress = () => void onGenerate()
    a11yHint = 'Tap to rebuild your nutrition plan'
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
            The chevron is now purely the accordion affordance — rebuilding
            moved into the body where it reads as a deliberate action rather
            than something you might hit while trying to expand. */}
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

          {canGenerateNutritionPlan && status.kind !== 'loading' && status.kind !== 'ready' && (
            <Pressable
              onPress={onPress}
              accessibilityRole="button"
              accessibilityLabel={title}
              accessibilityHint={a11yHint}
              style={[styles.cta, { backgroundColor: tint }]}
            >
              <Text style={{ color: '#fff', fontSize: sz(14), fontWeight: bold }}>{title}</Text>
            </Pressable>
          )}

          {status.kind === 'loading' && (
            <View style={styles.loadingRow}>
              <MaterialIcons name="sync" size={sz(16)} color={tint} />
              <Text style={{ color: subtext, fontSize: sz(13), marginLeft: 8 }}>
                Building your plan…
              </Text>
            </View>
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
                    advice that vanishes on the next rebuild. */}
                {added[i] === 'done' || existing.has(normalizeTitle(s.title)) ? (
                  <View style={styles.addedRow}>
                    <MaterialIcons name="check-circle" size={sz(14)} color={tint} />
                    <Text style={{ color: tint, fontSize: sz(12), fontWeight: bold, marginLeft: 4 }}>
                      On your plan — tick it off below
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => void onAddToPlan(i, s.title, s.rationale)}
                    disabled={added[i] === 'saving'}
                    accessibilityRole="button"
                    accessibilityLabel={`Add "${s.title}" to my plan`}
                    accessibilityHint="Adds a daily task you can tick off"
                    hitSlop={8}
                    style={styles.addBtn}
                  >
                    <MaterialIcons
                      name={added[i] === 'failed' ? 'refresh' : 'add-circle-outline'}
                      size={sz(14)}
                      color={tint}
                    />
                    <Text style={{ color: tint, fontSize: sz(12), fontWeight: bold, marginLeft: 4 }}>
                      {added[i] === 'saving'
                        ? 'Adding…'
                        : added[i] === 'failed'
                          ? "Couldn't add — tap to retry"
                          : 'Add to my plan'}
                    </Text>
                  </Pressable>
                )}
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

              {/* Rebuild lives here, as words, instead of the header icon
                  Vishal asked to remove. It is a deliberate action, not
                  something to hit while reaching for the chevron. */}
              {canGenerateNutritionPlan && (
              <Pressable
                onPress={() => void onGenerate()}
                accessibilityRole="button"
                accessibilityLabel="Rebuild my nutrition plan"
                hitSlop={8}
                style={styles.rebuild}
              >
                <Text style={{ color: tint, fontSize: sz(13), fontWeight: bold }}>
                  Rebuild my plan
                </Text>
              </Pressable>
              )}
            </View>
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
  cta: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  loadingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, minHeight: 44 },
  rebuild: { marginTop: 12, alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
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
  // 44pt target on a compact inline affordance comes from hitSlop rather
  // than height, so the suggestion rows stay tight.
  addBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 6, paddingVertical: 4 },
  addedRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, paddingVertical: 4 },
})
