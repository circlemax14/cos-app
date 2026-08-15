import React from 'react'
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router, useLocalSearchParams } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import {
  fetchInstruments,
  type InstrumentSummary,
  type InstrumentItem,
} from '@/services/api/instruments'
import { submitAssessment } from '@/services/api/assessments'
import {
  loadAssessmentDraft as loadDraft,
  saveAssessmentDraft as saveDraft,
  clearAssessmentDraft as clearDraft,
} from '@/lib/assessment-draft-storage'
import { getWarmerInstrumentLabel } from '@/lib/instrument-labels'
import { isGroupedInstrument } from '@/lib/instrument-grouping'
import { GroupedInstrumentStepper } from '@/components/health-plan/GroupedInstrumentStepper'
import {
  hasAcknowledgedSpiritualConsent,
  acknowledgeSpiritualConsent,
} from '@/lib/spiritual-consent'
import { SpiritualConsentModal } from '@/components/health-plan/SpiritualConsentModal'
import { CrisisSupportCard } from '@/components/assessments/CrisisSupportCard'
import { shouldOfferImmediateSupport } from '@/lib/crisis-support'

type Palette = typeof Colors['light'] | typeof Colors['dark']

/**
 * CHUNK 67 (2026-07-23): resolve the stepper's exit destination based on
 * an optional `returnTo` query param passed by the caller. All four exit
 * sites (celebration timer, Close, Back-when-first-step, not-found) share
 * this helper so they land the user on the same place regardless of which
 * exit fired. Preserves the historic catalog default so unaware callers
 * (patient-intake, direct deep links, older banners) keep working
 * unchanged. New destinations are added by extending the switch — do NOT
 * accept an arbitrary pathname to prevent open-redirect-style deep-link
 * abuse in URL sharing paths.
 */
function resolveReturnHref(returnTo: string | undefined): string {
  switch (returnTo) {
    case 'domain-checkins-bio':
      return '/Home/wellbeing-domain-checkins?domain=bio'
    case 'domain-checkins-mind':
      return '/Home/wellbeing-domain-checkins?domain=mind'
    case 'domain-checkins-social':
      return '/Home/wellbeing-domain-checkins?domain=social'
    // Vishal 2026-08-10: the nutrition card sends people here to take the
    // dietary screener; without this they land in the assessments catalog
    // afterwards instead of back at the plan they were building.
    case 'plan':
      return '/Home/health-plan'
    default:
      return '/Home/assessments-catalog'
  }
}

/**
 * Per-question stepper for a single instrument (SCRUM-225).
 *
 * Route: `/Home/assessment-stepper?instrumentId=<id>`
 *
 * Loads the active instrument list from cache, finds the requested one,
 * walks the user through one item per card. Local-state answers are not
 * persisted across mounts — if the user backs out before submitting,
 * the partial answers are lost (the catalog still shows "Not started").
 * Already-submitted assessments are preserved by the backend.
 */
export default function AssessmentStepperScreen(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const queryClient = useQueryClient()
  const params = useLocalSearchParams<{ instrumentId?: string; returnTo?: string }>()
  const instrumentId = typeof params.instrumentId === 'string' ? params.instrumentId : ''
  // CHUNK 67 (2026-07-23): stepper honors an optional `returnTo` param so
  // the four exit paths (celebration timer, Close button, Back-when-first,
  // instrument-not-found) all land on the caller's chosen screen instead
  // of the hard-coded catalog. Ken's dogfood on chunk 66: after finishing
  // a check-in he was dumped on the catalog instead of the picker he came
  // from, forcing an app-kill to escape. Fresh query param on each
  // navigation — no reset-effect needed.
  const returnTo = typeof params.returnTo === 'string' ? params.returnTo : undefined
  const returnHref = React.useMemo(() => resolveReturnHref(returnTo), [returnTo])

  const instrumentsQuery = useQuery({
    queryKey: ['instruments'],
    queryFn: fetchInstruments,
    staleTime: 5 * 60 * 1000,
  })

  const instrument: InstrumentSummary | undefined = (instrumentsQuery.data ?? []).find(
    (it) => it.instrumentId === instrumentId,
  )

  const [answers, setAnswers] = React.useState<Record<string, unknown>>({})
  const [stepIdx, setStepIdx] = React.useState(0)
  const [draftLoaded, setDraftLoaded] = React.useState(false)

  // Restore in-progress draft (SCRUM-227). User can cancel mid-flow and
  // resume without losing answers. Draft is cleared on successful submit.
  React.useEffect(() => {
    if (!instrumentId) {
      setDraftLoaded(true)
      return
    }
    let cancelled = false
    // SCRUM-528: reset to a clean slate for the NEW instrument before loading
    // its draft. The stepper is a single reused screen instance — without this,
    // a stale stepIdx/answers from a previous (longer) check-in carries over and
    // can index past the new, shorter instrument's items array → `items[stepIdx]`
    // is undefined → crash. The saved draft (if any) is overlaid after load.
    setDraftLoaded(false)
    setStepIdx(0)
    setAnswers({})
    void loadDraft(instrumentId).then((d) => {
      if (cancelled) return
      if (d) {
        setAnswers(d.answers)
        setStepIdx(d.stepIdx)
      }
      setDraftLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [instrumentId])

  // Persist draft as the user advances or edits. Debounce-by-effect:
  // the next change triggers another save, so worst-case the user can
  // lose one tap if they kill the app instantly. Acceptable for v1.
  React.useEffect(() => {
    if (!instrumentId || !draftLoaded) return
    if (Object.keys(answers).length === 0 && stepIdx === 0) return
    void saveDraft(instrumentId, { stepIdx, answers })
  }, [instrumentId, stepIdx, answers, draftLoaded])

  const [celebrating, setCelebrating] = React.useState(false)

  // Wave 4 (2026-07-28) — spiritual-consent gate. State machine:
  //   'checking' — initial: AsyncStorage read in flight
  //   'needs-consent' — spiritual instrument + never acknowledged → show modal
  //   'consented' — either not-spiritual, or already-acknowledged, or user
  //                  just tapped Take on the modal → render the stepper
  // The 'checking' state is short (single AsyncStorage read); the stepper
  // shows a spinner during it.
  type ConsentGateState = 'checking' | 'needs-consent' | 'consented'
  const [consentState, setConsentState] = React.useState<ConsentGateState>('checking')

  // Reset consent-state whenever instrumentId changes so navigating to a
  // NEW spiritual instrument re-checks (a user could have acknowledged
  // consent, backed out via Not Now, then tapped a different spiritual
  // check-in — we still want to gate that first-time-per-install ask).
  React.useEffect(() => {
    setConsentState('checking')
  }, [instrumentId])

  const submit = useMutation({
    mutationFn: () => submitAssessment(instrumentId, answers),
    onSuccess: () => {
      void clearDraft(instrumentId)
      queryClient.invalidateQueries({ queryKey: ['assessments'] })
      queryClient.invalidateQueries({ queryKey: ['ai-health-plan'] })
      // SCRUM-254: refresh the per-plan-type assigned-set progress so
      // the Health Plan screen's "Y of X complete" updates immediately.
      queryClient.invalidateQueries({ queryKey: ['health-plan-assignments'] })
      // CHUNK 67 (2026-07-23): close the cache-key gap between the
      // stepper (['assessments']) and BpsWellbeingScoreCard + the new
      // wellbeing-domain-checkins picker (['assessments-trends']). Both
      // hit the same endpoint but keep separate cache entries; without
      // this invalidate, the picker still shows "Not taken" for a
      // just-completed instrument until the 60s staleTime elapses —
      // exactly Ken's 2026-07-23 "had to force-close the app" symptom.
      queryClient.invalidateQueries({ queryKey: ['assessments-trends'] })
      // Insurance for the eventual "Refresh my plan" tap in the picker:
      // a bio-plan invalidation here is a no-op today (regen hasn't
      // fired yet) but keeps the surface honest if a future flow lands
      // on BPS between check-ins.
      queryClient.invalidateQueries({ queryKey: ['biopsychosocial-plan'] })
      // Ken 2026-08-06 iter 3 — the assessments sub-score is 40% of the
      // wellbeing composite. Invalidate both the current-day + history
      // caches so the Home tile arrow/sparkline and the detail screen's
      // component breakdown all refetch and reflect the new self-report
      // immediately (BE already dropped its cache row on the PUT).
      queryClient.invalidateQueries({ queryKey: ['wellbeing-score', 'current'] })
      queryClient.invalidateQueries({ queryKey: ['wellbeing-history'] })
      queryClient.invalidateQueries({ queryKey: ['wellbeing-score', 'warmer'] })
      // Show the celebration overlay (SCRUM-230) for ~1.5s, then return
      // to the caller-provided destination (chunk 67) or the catalog
      // default. The overlay handles its own dismiss timer.
      setCelebrating(true)
    },
  })

  // Auto-dismiss the celebration and route back when it ends.
  React.useEffect(() => {
    if (!celebrating) return
    const t = setTimeout(() => {
      router.replace(returnHref as never)
    }, 1500)
    return () => clearTimeout(t)
  }, [celebrating, returnHref])

  // SCRUM-527: the stepper is a single reused screen instance — navigating to a
  // different instrumentId doesn't remount it, so clear the completion overlay +
  // mutation state when the instrument changes, otherwise the prior "Nicely done"
  // celebration leaks to the next check-in.
  React.useEffect(() => {
    setCelebrating(false)
    submit.reset()
  }, [instrumentId])

  // Wave 4 — spiritual-consent gate check. Runs when the instrument is
  // loaded so we can read its `domain`. Hoisted above the early returns
  // to satisfy rules-of-hooks (called on every render, but no-ops until
  // both preconditions are true). The state itself is reset to 'checking'
  // whenever instrumentId changes (see effect above at line ~126).
  const instrumentDomain = instrument?.domain
  React.useEffect(() => {
    if (consentState !== 'checking') return
    if (!instrumentDomain) return  // instrument not loaded yet, wait
    let cancelled = false
    void (async () => {
      // Non-spiritual instruments bypass the gate entirely — protects
      // the 20+ non-spiritual check-ins from any consent-modal overhead.
      if (instrumentDomain !== 'spiritual') {
        if (!cancelled) setConsentState('consented')
        return
      }
      const already = await hasAcknowledgedSpiritualConsent()
      if (cancelled) return
      setConsentState(already ? 'consented' : 'needs-consent')
    })()
    return () => { cancelled = true }
  }, [consentState, instrumentDomain])

  if (instrumentsQuery.isLoading || (!instrument && !instrumentsQuery.error)) {
    return (
      <AppWrapper>
        <View style={[styles.centerWrap, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.tint as string} />
        </View>
      </AppWrapper>
    )
  }

  if (!instrument) {
    return (
      <AppWrapper>
        <View style={[styles.centerWrap, { backgroundColor: colors.background }]}>
          <MaterialIcons name="error-outline" size={getScaledFontSize(56)} color={colors.tint as string} />
          <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as any }]}>
            Check-in not found
          </Text>
          <Pressable
            onPress={() => router.replace(returnHref as never)}
            style={[styles.primaryBtn, { backgroundColor: colors.tint as string }]}
            accessibilityRole="button"
          >
            <Text style={{ color: '#fff', fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any }}>
              Back to check-ins
            </Text>
          </Pressable>
        </View>
      </AppWrapper>
    )
  }

  // While the AsyncStorage read is in flight, hold the render tree at a
  // spinner rather than flashing the stepper then immediately covering it
  // with the modal. Cheap because the read is ~1 frame.
  if (consentState === 'checking') {
    return (
      <AppWrapper>
        <View style={[styles.centerWrap, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.tint as string} />
        </View>
      </AppWrapper>
    )
  }

  // Needs-consent path — render the modal above a neutral background;
  // both consent CTAs are synchronous (AsyncStorage write is fire-and-
  // forget) so the Modal unmounts same-tick as the tap, matching Ken's
  // chunk 40/41 fireAndForget pattern for iOS 26 safety.
  if (consentState === 'needs-consent') {
    return (
      <AppWrapper>
        <View style={[styles.centerWrap, { backgroundColor: colors.background }]} />
        <SpiritualConsentModal
          visible
          instrumentLabel={getWarmerInstrumentLabel(instrument.instrumentId, instrument.name)}
          colors={colors}
          isDark={settings.isDarkTheme}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
          onAcknowledge={() => {
            void acknowledgeSpiritualConsent()
            setConsentState('consented')
          }}
          onDecline={() => {
            router.replace('/Home/assessments-catalog' as never)
          }}
        />
      </AppWrapper>
    )
  }

  // Wave 3 — celebration path first so both grouped and per-item modes
  // share it, then grouped-checklist path for instruments whose items are
  // all `kind: 'multi'` and category-tagged (Ohio DDC Leisure Interest).
  // Falls back to the per-item stepper below for every other instrument.
  if (celebrating) {
    return (
      <AppWrapper>
        <CompletionCelebration colors={colors} fontSize={getScaledFontSize} fontWeight={getScaledFontWeight} />
      </AppWrapper>
    )
  }
  if (isGroupedInstrument(instrument.items)) {
    return (
      <AppWrapper>
        <GroupedInstrumentStepper
          instrument={instrument}
          answers={answers}
          setAnswers={setAnswers}
          onSubmit={() => submit.mutate()}
          onCancel={() => router.replace('/Home/assessments-catalog' as never)}
          isSubmitting={submit.isPending}
          colors={colors}
          fontSize={getScaledFontSize}
          fontWeight={getScaledFontWeight}
        />
      </AppWrapper>
    )
  }

  const items = instrument.items
  const total = items.length
  const item = items[stepIdx]
  // SCRUM-528: guard the transient render where stepIdx is stale for a
  // just-changed instrument (the draft-load effect resets it post-render).
  // Indexing past the new instrument's items leaves `item` undefined, and
  // `answers[item.id]` below would crash. Show a loader until the effect
  // resets stepIdx and the correct item resolves.
  if (!item) {
    return (
      <AppWrapper>
        <View style={[styles.centerWrap, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.tint as string} />
        </View>
      </AppWrapper>
    )
  }
  const isLast = stepIdx >= total - 1
  const isFirst = stepIdx === 0
  const currentValue = answers[item.id]
  const currentAnswered = currentValue !== undefined && currentValue !== null && currentValue !== ''

  const setAnswer = (value: unknown) => {
    setAnswers((prev) => ({ ...prev, [item.id]: value }))
  }

  /**
   * PHQ-9 q9 is "Thoughts that you would be better off dead, or hurting
   * yourself". Until today, answering it did nothing at all.
   *
   * Read off the CURRENT answer rather than a latch, so going Back to the
   * question shows it again — someone who returns to reconsider that answer is
   * the last person who should find the offer withdrawn. Any endorsement
   * counts, including "Several days"; see lib/crisis-support for why the
   * threshold is not higher.
   */
  const showCrisisSupport = shouldOfferImmediateSupport(
    instrument.instrumentId,
    item.id,
    currentValue,
  )

  const advance = () => {
    if (!currentAnswered) return
    if (isLast) {
      submit.mutate()
    } else {
      setStepIdx((i) => Math.min(i + 1, total - 1))
    }
  }

  const goBack = () => {
    if (isFirst) {
      router.replace(returnHref as never)
    } else {
      setStepIdx((i) => Math.max(i - 1, 0))
    }
  }

  return (
    <AppWrapper>
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.replace(returnHref as never)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close check-in"
          >
            <MaterialIcons name="close" size={getScaledFontSize(24)} color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(600) as any, marginLeft: 12 }]} numberOfLines={1}>
            {getWarmerInstrumentLabel(instrument.instrumentId, instrument.name)}
          </Text>
        </View>

        <ProgressBar current={stepIdx + 1} total={total} colors={colors} />

        <Text style={[styles.stepLabel, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>
          Question {stepIdx + 1} of {total}
        </Text>

        <View style={[styles.questionCard, { backgroundColor: (colors.card as string) + 'D9', borderColor: colors.border }]}>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(18),
              fontWeight: getScaledFontWeight(600) as any,
              lineHeight: getScaledFontSize(26),
            }}
          >
            {item.text}
          </Text>
          {item.help ? (
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 8 }}>
              {item.help}
            </Text>
          ) : null}
          <View style={{ marginTop: 20 }}>
            <ItemControl
              item={item}
              value={currentValue}
              onChange={setAnswer}
              colors={colors}
              fontSize={getScaledFontSize}
              fontWeight={getScaledFontWeight}
            />
          </View>
        </View>

        {/* Appears the instant the item is endorsed, under the question that
            asked it — not on the results screen. Question nine of nine is a
            plausible place to stop, and a design that waits for submission
            reaches nobody who stops there.

            It does not block, and there is no dismiss control: it sits in the
            flow and scrolls past. A patient who learns that honest answers
            trap them in a dialog learns to answer dishonestly, and then the
            instrument measures nothing. */}
        {showCrisisSupport ? <CrisisSupportCard /> : null}

        <View style={styles.actions}>
          <Pressable
            onPress={goBack}
            disabled={submit.isPending}
            style={[styles.secondaryBtn, { borderColor: colors.border }]}
            accessibilityRole="button"
          >
            <Text style={{ color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any }}>
              {isFirst ? 'Cancel' : 'Back'}
            </Text>
          </Pressable>
          <Pressable
            onPress={advance}
            disabled={!currentAnswered || submit.isPending}
            style={[
              styles.primaryBtnInline,
              {
                backgroundColor: currentAnswered ? (colors.tint as string) : (colors.subtext + '60'),
                opacity: submit.isPending ? 0.6 : 1,
              },
            ]}
            accessibilityRole="button"
          >
            {submit.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any }}>
                {isLast ? 'Submit' : 'Next'}
              </Text>
            )}
          </Pressable>
        </View>

        {submit.error ? (
          <Text style={{ color: '#DC2626', fontSize: getScaledFontSize(12), textAlign: 'center', marginTop: 10 }}>
            Couldn&apos;t save. Tap Submit again.
          </Text>
        ) : null}
      </ScrollView>
    </AppWrapper>
  )
}

/**
 * Tap-bounce + color transition on each option row. Gives the user a
 * crisp confirmation that their tap registered. Pure RN Animated —
 * no extra deps.
 */
function AnimatedOptionRow({
  label,
  iconActive,
  iconInactive,
  active,
  onPress,
  accessibilityRole,
  colors,
  fontSize,
  fontWeight,
}: {
  label: string
  iconActive: keyof typeof MaterialIcons.glyphMap
  iconInactive: keyof typeof MaterialIcons.glyphMap
  active: boolean
  onPress: () => void
  accessibilityRole: 'radio' | 'checkbox'
  colors: Palette
  fontSize: (n: number) => number
  fontWeight: (n: number) => number | string
}): React.JSX.Element {
  const scale = React.useRef(new Animated.Value(1)).current
  // SCRUM-230: sparkle burst on each tap. We trigger 3 small sparkles
  // animating from the row out to short random offsets, then fade.
  const [burstId, setBurstId] = React.useState(0)

  const tap = () => {
    onPress()
    // Bounce + sparkle. Bounce uses native driver for smoothness;
    // sparkles run independently via their own component.
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 200, useNativeDriver: true }),
    ]).start()
    setBurstId((n) => n + 1)
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={tap}
        accessibilityRole={accessibilityRole}
        accessibilityState={accessibilityRole === 'radio' ? { selected: active } : { checked: active }}
        style={[
          styles.optionRow,
          {
            backgroundColor: active ? (colors.tint as string) : (colors.card as string) + 'CC',
            borderColor: active ? (colors.tint as string) : colors.border,
          },
        ]}
      >
        <MaterialIcons
          name={active ? iconActive : iconInactive}
          size={fontSize(20)}
          color={active ? '#fff' : colors.subtext}
        />
        <Text
          style={{
            marginLeft: 10,
            color: active ? '#fff' : colors.text,
            fontSize: fontSize(14),
            fontWeight: fontWeight(active ? 600 : 500) as any,
            flex: 1,
          }}
        >
          {label}
        </Text>
        {/* Sparkle burst sits overlaid; re-renders on each tap via key */}
        <SparkleBurst key={burstId} active={burstId > 0} color={active ? '#fff' : (colors.tint as string)} />
      </Pressable>
    </Animated.View>
  )
}

/**
 * Three small auto-awesome sparkles that fade in + scale up + drift
 * outward, then fade out. Positioned absolutely over the parent.
 */
function SparkleBurst({ active, color }: { active: boolean; color: string }): React.JSX.Element | null {
  if (!active) return null
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {[0, 1, 2].map((i) => (
        <Sparkle key={i} index={i} color={color} />
      ))}
    </View>
  )
}

function Sparkle({ index, color }: { index: number; color: string }): React.JSX.Element {
  const opacity = React.useRef(new Animated.Value(0)).current
  const scale = React.useRef(new Animated.Value(0.6)).current
  const translateX = React.useRef(new Animated.Value(0)).current
  const translateY = React.useRef(new Animated.Value(0)).current

  React.useEffect(() => {
    const dx = [-26, 0, 26][index] ?? 0
    const dy = [-12, -22, -12][index] ?? -20
    Animated.parallel([
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 380, useNativeDriver: true }),
      ]),
      Animated.timing(scale, { toValue: 1.1, duration: 500, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: dx, duration: 500, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: dy, duration: 500, useNativeDriver: true }),
    ]).start()
  }, [index, opacity, scale, translateX, translateY])

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        opacity,
        transform: [{ translateX }, { translateY }, { scale }],
      }}
    >
      <MaterialIcons name="auto-awesome" size={14} color={color} />
    </Animated.View>
  )
}

/**
 * Full-screen completion celebration after the user submits the final
 * answer. Fades in, holds, fades out via the parent's timer.
 */
function CompletionCelebration({
  colors,
  fontSize,
  fontWeight,
}: {
  colors: Palette
  fontSize: (n: number) => number
  fontWeight: (n: number) => number | string
}): React.JSX.Element {
  const opacity = React.useRef(new Animated.Value(0)).current
  const checkScale = React.useRef(new Animated.Value(0.4)).current

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(checkScale, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }),
    ]).start()
  }, [opacity, checkScale])

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        styles.celebrateWrap,
        { backgroundColor: colors.background + 'F2', opacity },
      ]}
    >
      <View style={[styles.celebrateBubble, { backgroundColor: (colors.tint as string) + '22', borderColor: (colors.tint as string) + '55' }]}>
        <Animated.View style={{ transform: [{ scale: checkScale }] }}>
          <MaterialIcons name="check-circle" size={92} color={colors.tint as string} />
        </Animated.View>
        {/* Surrounding sparkles */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <CelebrationSparkle key={i} index={i} color={colors.tint as string} />
          ))}
        </View>
      </View>
      <Text
        style={{
          color: colors.text,
          fontSize: fontSize(22),
          fontWeight: fontWeight(700) as any,
          marginTop: 18,
        }}
      >
        Nicely done!
      </Text>
      <Text
        style={{
          color: colors.subtext,
          fontSize: fontSize(14),
          textAlign: 'center',
          marginTop: 6,
          paddingHorizontal: 32,
        }}
      >
        Your answers are saved.
      </Text>
    </Animated.View>
  )
}

function CelebrationSparkle({ index, color }: { index: number; color: string }): React.JSX.Element {
  const opacity = React.useRef(new Animated.Value(0)).current
  const scale = React.useRef(new Animated.Value(0.4)).current
  const angle = (index / 6) * Math.PI * 2
  const distance = 70
  const dx = Math.cos(angle) * distance
  const dy = Math.sin(angle) * distance
  const translateX = React.useRef(new Animated.Value(0)).current
  const translateY = React.useRef(new Animated.Value(0)).current

  React.useEffect(() => {
    Animated.parallel([
      Animated.sequence([
        Animated.delay(index * 50),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(300),
        Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(index * 50),
        Animated.timing(scale, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(index * 50),
        Animated.timing(translateX, { toValue: dx, duration: 700, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(index * 50),
        Animated.timing(translateY, { toValue: dy, duration: 700, useNativeDriver: true }),
      ]),
    ]).start()
  }, [index, dx, dy, opacity, scale, translateX, translateY])

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        opacity,
        transform: [{ translateX }, { translateY }, { scale }],
      }}
    >
      <MaterialIcons name="auto-awesome" size={22} color={color} />
    </Animated.View>
  )
}

function ProgressBar({
  current,
  total,
  colors,
}: {
  current: number
  total: number
  colors: Palette
}) {
  const pct = Math.max(0, Math.min(1, current / total))
  return (
    <View style={[styles.progressOuter, { backgroundColor: colors.border }]}>
      <View
        style={[
          styles.progressInner,
          { backgroundColor: colors.tint as string, width: `${pct * 100}%` },
        ]}
      />
    </View>
  )
}

function ItemControl({
  item,
  value,
  onChange,
  colors,
  fontSize,
  fontWeight,
}: {
  item: InstrumentItem
  value: unknown
  onChange: (v: unknown) => void
  colors: Palette
  fontSize: (n: number) => number
  fontWeight: (n: number) => number | string
}): React.JSX.Element {
  if ((item.kind === 'likert' || item.kind === 'choice') && Array.isArray(item.options)) {
    return (
      <View style={{ gap: 8 }}>
        {item.options.map((opt) => (
          <AnimatedOptionRow
            key={String(opt.value)}
            label={opt.label}
            iconActive="radio-button-checked"
            iconInactive="radio-button-unchecked"
            active={value === opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="radio"
            colors={colors}
            fontSize={fontSize}
            fontWeight={fontWeight}
          />
        ))}
      </View>
    )
  }
  if (item.kind === 'multi' && Array.isArray(item.options)) {
    const selected = Array.isArray(value) ? (value as unknown[]) : []
    return (
      <View style={{ gap: 8 }}>
        {item.options.map((opt) => {
          const active = selected.includes(opt.value)
          return (
            <AnimatedOptionRow
              key={String(opt.value)}
              label={opt.label}
              iconActive="check-box"
              iconInactive="check-box-outline-blank"
              active={active}
              onPress={() =>
                onChange(active ? selected.filter((v) => v !== opt.value) : [...selected, opt.value])
              }
              accessibilityRole="checkbox"
              colors={colors}
              fontSize={fontSize}
              fontWeight={fontWeight}
            />
          )
        })}
      </View>
    )
  }
  if (item.kind === 'number') {
    return (
      <TextInput
        keyboardType="numeric"
        value={typeof value === 'number' ? String(value) : ''}
        onChangeText={(t) => {
          const n = Number.parseFloat(t)
          onChange(Number.isFinite(n) ? n : undefined)
        }}
        placeholder={item.min != null && item.max != null ? `${item.min}–${item.max}` : 'Enter a number'}
        placeholderTextColor={colors.subtext}
        style={[styles.textInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background, minHeight: 48 }]}
      />
    )
  }
  return (
    <TextInput
      value={typeof value === 'string' ? value : ''}
      onChangeText={onChange}
      placeholder="Type your answer"
      placeholderTextColor={colors.subtext}
      multiline
      style={[styles.textInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
    />
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, paddingBottom: 12 },
  headerTitle: { flex: 1 },
  title: { marginTop: 12, textAlign: 'center' },
  primaryBtn: { marginTop: 18, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999 },
  stepLabel: { marginTop: 10, marginBottom: 6, letterSpacing: 0.4 },
  progressOuter: { height: 6, borderRadius: 999, overflow: 'hidden' },
  progressInner: { height: '100%' },
  questionCard: {
    marginTop: 8,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  },
  textInput: {
    minHeight: 72,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 18,
  },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnInline: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  celebrateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  celebrateBubble: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
