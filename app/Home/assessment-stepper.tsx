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
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import {
  fetchInstruments,
  type InstrumentSummary,
  type InstrumentItem,
} from '@/services/api/instruments'
import { submitAssessment } from '@/services/api/assessments'

const DRAFT_KEY_PREFIX = 'assessment-draft:'
interface Draft {
  stepIdx: number
  answers: Record<string, unknown>
}

async function loadDraft(instrumentId: string): Promise<Draft | null> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY_PREFIX + instrumentId)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Draft
    if (typeof parsed.stepIdx === 'number' && parsed.answers && typeof parsed.answers === 'object') {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

async function saveDraft(instrumentId: string, draft: Draft): Promise<void> {
  try {
    await AsyncStorage.setItem(DRAFT_KEY_PREFIX + instrumentId, JSON.stringify(draft))
  } catch {
    /* ignore — draft is best-effort */
  }
}

async function clearDraft(instrumentId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(DRAFT_KEY_PREFIX + instrumentId)
  } catch {
    /* ignore */
  }
}

type Palette = typeof Colors['light'] | typeof Colors['dark']

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
  const params = useLocalSearchParams<{ instrumentId?: string }>()
  const instrumentId = typeof params.instrumentId === 'string' ? params.instrumentId : ''

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

  const submit = useMutation({
    mutationFn: () => submitAssessment(instrumentId, answers),
    onSuccess: () => {
      void clearDraft(instrumentId)
      queryClient.invalidateQueries({ queryKey: ['assessments'] })
      queryClient.invalidateQueries({ queryKey: ['ai-health-plan'] })
      router.replace('/Home/assessments-catalog' as never)
    },
  })

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
            onPress={() => router.replace('/Home/assessments-catalog' as never)}
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

  const items = instrument.items
  const total = items.length
  const item = items[stepIdx]
  const isLast = stepIdx >= total - 1
  const isFirst = stepIdx === 0
  const currentValue = answers[item.id]
  const currentAnswered = currentValue !== undefined && currentValue !== null && currentValue !== ''

  const setAnswer = (value: unknown) => {
    setAnswers((prev) => ({ ...prev, [item.id]: value }))
  }

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
      router.replace('/Home/assessments-catalog' as never)
    } else {
      setStepIdx((i) => Math.max(i - 1, 0))
    }
  }

  return (
    <AppWrapper>
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.replace('/Home/assessments-catalog' as never)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close check-in"
          >
            <MaterialIcons name="close" size={getScaledFontSize(24)} color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(600) as any, marginLeft: 12 }]} numberOfLines={1}>
            {instrument.name}
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

  const tap = () => {
    onPress()
    // Bounce: shrink then spring back. Tuned to feel responsive but
    // never block the underlying state change.
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 200, useNativeDriver: true }),
    ]).start()
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
      </Pressable>
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
})
