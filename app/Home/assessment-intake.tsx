import React from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Card } from 'react-native-paper'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router, useLocalSearchParams } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import {
  fetchAssessmentPrefill,
  submitAssessment,
  type PrefillSummary,
} from '@/services/api/assessments'
import {
  fetchInstruments,
  type InstrumentSummary,
  type InstrumentItem as DefinitionItem,
} from '@/services/api/instruments'
import { usePlanType, meetsTier } from '@/hooks/use-plan-type'

// All instrument items + scoring now live in the DB (SCRUM-217/223). The
// screen renders whatever the active instrument list returns. Two
// hardcoded sections remain because they have no DB entry yet: smoking +
// exercise (single-question lifestyle screen) and goals (free-form
// selection + open text).

// Explicit display order — clinical sense: well-being first, mood next,
// then sleep/pain/social, then alcohol, function, falls, nutrition,
// cognition. PHQ-9 is only included when PHQ-2 sum >= 3.
const INSTRUMENT_DISPLAY_ORDER: readonly string[] = [
  'wellbeing-5',
  'phq-2',
  'phq-9',
  'gad-7',
  'sleep-4',
  'pain-4',
  'loneliness-3',
  'alcohol-3',
  'physical-function-4',
  'adl',
  'iadl',
  'falls-12',
  'nutrition-5',
  'cognition-8',
]

const GOAL_CHOICES = [
  'Better sleep',
  'More energy',
  'Lose weight',
  'Manage a condition',
  'Less stress',
  'Stay independent',
  'Move more',
  'Eat better',
] as const

/**
 * Adaptive health-assessment intake.
 *
 * Flow:
 *   1. Pre-fill review — show what we already know from FHIR ("Confirm" / "Update")
 *   2. Well-being (single slider 0-10)
 *   3. Lifestyle (smoking / alcohol / exercise / sleep hours)
 *   4. PHQ-2 (always)
 *   5. PHQ-9 (conditional: PHQ-2 sum ≥3)
 *   6. Goals (pick 3 + optional free text)
 *
 * Each section is PUT to /v1/patients/me/assessments/:instrumentId as the
 * user advances. No save-and-resume in v1 — keep it short, encourage
 * single-session completion.
 */
export default function AssessmentIntakeScreen(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const queryClient = useQueryClient()

  // When source=plan-upgrade the user just picked Advanced/Agency and is
  // expected to land on the Plan tab after submitting (where their new AI
  // plan, regenerated with the assessment context, will be visible).
  const params = useLocalSearchParams<{ source?: string }>()
  const fromPlanUpgrade = params.source === 'plan-upgrade'

  // Plan-tier gate — basic users land on the upgrade prompt instead of
  // the form. Backend also returns 403 on the prefill / submit endpoints,
  // so this is purely a UX layer.
  const { planType, isLoading: planLoading } = usePlanType()
  const canAccessAssessments = meetsTier(planType, 'advanced')

  const prefillQuery = useQuery({
    queryKey: ['assessment-prefill'],
    queryFn: fetchAssessmentPrefill,
    enabled: canAccessAssessments,
  })

  const instrumentsQuery = useQuery({
    queryKey: ['instruments'],
    queryFn: fetchInstruments,
    enabled: canAccessAssessments,
    staleTime: 5 * 60 * 1000,
  })

  // Hardcoded sections (no DB entry yet): smoking, exercise, goals.
  const [smoking, setSmoking] = React.useState<string>('never')
  const [exercise, setExercise] = React.useState<string>('1-2x/week')
  const [goals, setGoals] = React.useState<string[]>([])
  const [goalFreeText, setGoalFreeText] = React.useState<string>('')

  // DB-driven instrument responses, keyed by instrumentId → itemId → value.
  type ResponseMap = Record<string, Record<string, unknown>>
  const [responses, setResponses] = React.useState<ResponseMap>({})
  const [submitted, setSubmitted] = React.useState<boolean>(false)

  const setAnswer = React.useCallback((instrumentId: string, itemId: string, value: unknown) => {
    setResponses((prev) => ({
      ...prev,
      [instrumentId]: { ...(prev[instrumentId] ?? {}), [itemId]: value },
    }))
  }, [])

  // Skip-logic gate: PHQ-9 only fires when PHQ-2 sum >= 3.
  const phq2 = responses['phq-2']
  const phq2Sum =
    (typeof phq2?.q1 === 'number' ? phq2.q1 : 0) +
    (typeof phq2?.q2 === 'number' ? phq2.q2 : 0)
  const needsPhq9 = phq2Sum >= 3

  // Ordered, filtered list of visible instruments for this user.
  const visibleInstruments = React.useMemo<InstrumentSummary[]>(() => {
    const all = instrumentsQuery.data ?? []
    const byId = new Map(all.map((it) => [it.instrumentId, it]))
    const ordered: InstrumentSummary[] = []
    for (const id of INSTRUMENT_DISPLAY_ORDER) {
      if (id === 'phq-9' && !needsPhq9) continue
      const found = byId.get(id)
      if (found) ordered.push(found)
    }
    // Append anything in the API list we don't have an explicit order for
    // (so newly added instruments still surface without a mobile push).
    for (const it of all) {
      if (!INSTRUMENT_DISPLAY_ORDER.includes(it.instrumentId)) ordered.push(it)
    }
    return ordered
  }, [instrumentsQuery.data, needsPhq9])

  const submit = useMutation({
    mutationFn: async () => {
      const calls: Promise<unknown>[] = []
      // DB-driven instruments — submit answered ones in parallel.
      for (const inst of visibleInstruments) {
        const answers = responses[inst.instrumentId]
        if (answers && Object.keys(answers).length > 0) {
          calls.push(submitAssessment(inst.instrumentId, answers))
        }
      }
      // Hardcoded screens (no DB entry).
      calls.push(submitAssessment('lifestyle', { smoking, exercise }))
      calls.push(submitAssessment('goals', { selected: goals, freeText: goalFreeText.trim() }))
      await Promise.all(calls)
    },
    onSuccess: () => {
      setSubmitted(true)
      queryClient.invalidateQueries({ queryKey: ['assessments'] })
      queryClient.invalidateQueries({ queryKey: ['ai-health-plan'] })
    },
  })

  // Every visible instrument needs every item answered + at least one goal picked.
  const allRequiredAnswered = React.useMemo(() => {
    if (goals.length === 0) return false
    for (const inst of visibleInstruments) {
      const answers = responses[inst.instrumentId] ?? {}
      for (const item of inst.items) {
        if (answers[item.id] === undefined || answers[item.id] === null) return false
      }
    }
    return true
  }, [visibleInstruments, responses, goals.length])

  if (planLoading) {
    return (
      <AppWrapper>
        <View style={[styles.completeWrap, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.tint as string} />
        </View>
      </AppWrapper>
    )
  }

  if (!canAccessAssessments) {
    return (
      <AppWrapper>
        <View style={[styles.completeWrap, { backgroundColor: colors.background }]}>
          <MaterialIcons name="lock-outline" size={getScaledFontSize(56)} color={colors.tint as string} />
          <Text style={[styles.completeTitle, { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(700) as any }]}>
            Health check-ins are an Advanced feature
          </Text>
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), textAlign: 'center', marginTop: 8, paddingHorizontal: 24 }}>
            Upgrade to the Advanced plan to access guided check-ins, AI-personalized plans, and care-team insights.
          </Text>
          <Pressable
            onPress={() => router.replace('/Home/health-plan' as never)}
            style={[styles.doneBtn, { backgroundColor: colors.tint as string }]}
            accessibilityRole="button"
            accessibilityLabel="View plans"
          >
            <Text style={{ color: '#fff', fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any }}>View plans</Text>
          </Pressable>
          <Pressable
            onPress={() => router.back()}
            style={{ marginTop: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13) }}>Back</Text>
          </Pressable>
        </View>
      </AppWrapper>
    )
  }

  if (submitted) {
    return (
      <AppWrapper>
        <View style={[styles.completeWrap, { backgroundColor: colors.background }]}>
          <MaterialIcons name="check-circle" size={getScaledFontSize(64)} color={colors.tint as string} />
          <Text style={[styles.completeTitle, { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(700) as any }]}>
            Thanks for completing your check-in
          </Text>
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), textAlign: 'center', marginTop: 8, paddingHorizontal: 24 }}>
            Your plan will refresh with these inputs in a few moments.
          </Text>
          <Pressable
            onPress={() => router.replace('/Home/health-plan' as never)}
            style={[styles.doneBtn, { backgroundColor: colors.tint as string }]}
            accessibilityRole="button"
          >
            <Text style={{ color: '#fff', fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any }}>
              {fromPlanUpgrade ? 'See my plan' : 'Done'}
            </Text>
          </Pressable>
        </View>
      </AppWrapper>
    )
  }

  return (
    <AppWrapper>
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
            <MaterialIcons name="arrow-back" size={getScaledFontSize(24)} color={colors.text} />
          </Pressable>
          <Text style={{
            color: colors.text,
            fontSize: getScaledFontSize(22),
            fontWeight: getScaledFontWeight(700) as any,
            marginLeft: 12,
            flex: 1,
          }}>Health check-in</Text>
        </View>

        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), paddingHorizontal: 16, marginBottom: 12 }}>
          A short check-in so your plan reflects how you&apos;re actually doing. We&apos;ll only ask for what we don&apos;t already know.
        </Text>

        {/* Pre-fill review */}
        <PrefillSection prefill={prefillQuery.data} loading={prefillQuery.isLoading} colors={colors} fontSize={getScaledFontSize} fontWeight={getScaledFontWeight} />

        {/* DB-driven instruments — one Section per instrument */}
        {instrumentsQuery.isLoading ? (
          <View style={{ alignItems: 'center', padding: 24 }}>
            <ActivityIndicator color={colors.tint as string} />
          </View>
        ) : (
          visibleInstruments.map((inst) => (
            <InstrumentSection
              key={inst.instrumentId}
              instrument={inst}
              answers={responses[inst.instrumentId] ?? {}}
              onAnswer={(itemId, value) => setAnswer(inst.instrumentId, itemId, value)}
              colors={colors}
              fontSize={getScaledFontSize}
              fontWeight={getScaledFontWeight}
            />
          ))
        )}

        {/* Hardcoded lifestyle bookend (smoking + exercise) — no DB entry yet */}
        <Section title="A few lifestyle questions" colors={colors} fontSize={getScaledFontSize} fontWeight={getScaledFontWeight}>
          <ChoiceRow label="Smoking" options={['never', 'former', 'occasional', 'daily']} value={smoking} onChange={setSmoking} colors={colors} fontSize={getScaledFontSize} fontWeight={getScaledFontWeight} />
          <ChoiceRow label="Exercise" options={['none', '1-2x/week', '3-4x/week', 'daily']} value={exercise} onChange={setExercise} colors={colors} fontSize={getScaledFontSize} fontWeight={getScaledFontWeight} />
        </Section>

        {/* Goals */}
        <Section title="What would you like to focus on?" colors={colors} fontSize={getScaledFontSize} fontWeight={getScaledFontWeight}>
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginBottom: 8 }}>
            Pick up to 3.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {GOAL_CHOICES.map((g) => {
              const selected = goals.includes(g)
              return (
                <Pressable
                  key={g}
                  onPress={() => {
                    setGoals((prev) => prev.includes(g)
                      ? prev.filter((x) => x !== g)
                      : prev.length < 3 ? [...prev, g] : prev)
                  }}
                  style={[
                    styles.choiceChip,
                    {
                      backgroundColor: selected ? (colors.tint as string) : 'transparent',
                      borderColor: selected ? (colors.tint as string) : (colors.text + '30'),
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={{ color: selected ? '#fff' : colors.text, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(selected ? 600 : 500) as any }}>
                    {g}
                  </Text>
                </Pressable>
              )
            })}
          </View>
          <TextInput
            value={goalFreeText}
            onChangeText={setGoalFreeText}
            placeholder="Anything else you'd like your plan to focus on?"
            placeholderTextColor={colors.subtext}
            multiline
            style={[styles.textInput, { color: colors.text, borderColor: colors.text + '30', backgroundColor: colors.card }]}
          />
        </Section>

        {/* Submit */}
        <Pressable
          onPress={() => submit.mutate()}
          disabled={!allRequiredAnswered || submit.isPending}
          style={[
            styles.submitBtn,
            {
              backgroundColor: allRequiredAnswered ? (colors.tint as string) : (colors.subtext + '60'),
              opacity: submit.isPending ? 0.7 : 1,
            },
          ]}
          accessibilityRole="button"
        >
          {submit.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(700) as any }}>
              Save my check-in
            </Text>
          )}
        </Pressable>
        {submit.error ? (
          <Text style={{ color: '#DC2626', fontSize: getScaledFontSize(12), textAlign: 'center', marginTop: 10 }}>
            Couldn&apos;t save. Tap again or come back later.
          </Text>
        ) : null}
      </ScrollView>
    </AppWrapper>
  )
}

function Section({
  title, children, colors, fontSize, fontWeight,
}: {
  title: string
  children: React.ReactNode
  colors: { text: string; subtext: string; card: string }
  fontSize: (n: number) => number
  fontWeight: (n: number) => string
}): React.JSX.Element {
  return (
    <Card style={[styles.section, { backgroundColor: colors.card }]}>
      <Card.Content>
        <Text style={{ color: colors.text, fontSize: fontSize(15), fontWeight: fontWeight(700) as any, marginBottom: 10 }}>
          {title}
        </Text>
        {children}
      </Card.Content>
    </Card>
  )
}

function PrefillSection({
  prefill, loading, colors, fontSize, fontWeight,
}: {
  prefill: PrefillSummary | undefined
  loading: boolean
  colors: { text: string; subtext: string; card: string; tint: string | undefined }
  fontSize: (n: number) => number
  fontWeight: (n: number) => string
}): React.JSX.Element {
  return (
    <Card style={[styles.section, { backgroundColor: colors.card }]}>
      <Card.Content>
        <Text style={{ color: colors.text, fontSize: fontSize(15), fontWeight: fontWeight(700) as any, marginBottom: 8 }}>
          What we already know
        </Text>
        {loading ? (
          <ActivityIndicator color={colors.tint as string} />
        ) : !prefill ? (
          <Text style={{ color: colors.subtext, fontSize: fontSize(13) }}>
            Nothing pulled in yet — we&apos;ll learn more as you connect health records.
          </Text>
        ) : (
          <View style={{ gap: 6 }}>
            {prefill.demographics.age != null ? (
              <Text style={{ color: colors.text, fontSize: fontSize(13) }}>
                Age <Text style={{ fontWeight: fontWeight(700) as any }}>{prefill.demographics.age}</Text>
              </Text>
            ) : null}
            {prefill.conditions.length > 0 ? (
              <Text style={{ color: colors.text, fontSize: fontSize(13) }}>
                Conditions: <Text style={{ fontWeight: fontWeight(600) as any }}>{prefill.conditions.map((c) => c.data.name).slice(0, 4).join(', ')}</Text>
                {prefill.conditions.length > 4 ? `, +${prefill.conditions.length - 4} more` : ''}
              </Text>
            ) : null}
            {prefill.medications.length > 0 ? (
              <Text style={{ color: colors.text, fontSize: fontSize(13) }}>
                Medications: <Text style={{ fontWeight: fontWeight(600) as any }}>{prefill.medications.map((m) => m.data.name).slice(0, 4).join(', ')}</Text>
                {prefill.medications.length > 4 ? `, +${prefill.medications.length - 4} more` : ''}
              </Text>
            ) : null}
            {prefill.allergies.length > 0 ? (
              <Text style={{ color: colors.text, fontSize: fontSize(13) }}>
                Allergies: <Text style={{ fontWeight: fontWeight(600) as any }}>{prefill.allergies.map((a) => a.data.substance).join(', ')}</Text>
              </Text>
            ) : null}
            <Text style={{ color: colors.subtext, fontSize: fontSize(11), marginTop: 4, fontStyle: 'italic' }}>
              We won&apos;t ask about anything above — just the gaps.
            </Text>
          </View>
        )}
      </Card.Content>
    </Card>
  )
}

// ScaleRow removed — generic ItemControl handles likert/choice rendering now.

/**
 * Renders a DB-defined instrument (SCRUM-217/223) generically. Each item
 * is rendered based on its `kind` and the chosen value is reported back
 * via `onAnswer`.
 */
function InstrumentSection({
  instrument,
  answers,
  onAnswer,
  colors,
  fontSize,
  fontWeight,
}: {
  instrument: InstrumentSummary
  answers: Record<string, unknown>
  onAnswer: (itemId: string, value: unknown) => void
  colors: { text: string; subtext: string; card: string; tint: string | undefined }
  fontSize: (n: number) => number
  fontWeight: (n: number) => string
}): React.JSX.Element {
  return (
    <Section title={instrument.name} colors={colors} fontSize={fontSize} fontWeight={fontWeight}>
      {instrument.description ? (
        <Text style={{ color: colors.subtext, fontSize: fontSize(12), marginBottom: 10 }}>
          {instrument.description}
        </Text>
      ) : null}
      {instrument.items.map((item, idx) => (
        <View key={item.id} style={{ marginBottom: 14 }}>
          <Text style={{ color: colors.text, fontSize: fontSize(13), marginBottom: 6 }}>
            {idx + 1}. {item.text}
          </Text>
          <ItemControl
            item={item}
            value={answers[item.id]}
            onChange={(v) => onAnswer(item.id, v)}
            colors={colors}
            fontSize={fontSize}
            fontWeight={fontWeight}
          />
        </View>
      ))}
    </Section>
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
  item: DefinitionItem
  value: unknown
  onChange: (v: unknown) => void
  colors: { text: string; subtext: string; card: string; tint: string | undefined }
  fontSize: (n: number) => number
  fontWeight: (n: number) => string
}): React.JSX.Element {
  if ((item.kind === 'likert' || item.kind === 'choice') && Array.isArray(item.options)) {
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {item.options.map((opt) => {
          const active = value === opt.value
          return (
            <Pressable
              key={String(opt.value)}
              onPress={() => onChange(opt.value)}
              style={[
                styles.choiceChip,
                {
                  backgroundColor: active ? (colors.tint as string) : 'transparent',
                  borderColor: active ? (colors.tint as string) : (colors.text + '30'),
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={{ color: active ? '#fff' : colors.text, fontSize: fontSize(12), fontWeight: fontWeight(active ? 600 : 500) as any }}>
                {opt.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    )
  }
  if (item.kind === 'multi' && Array.isArray(item.options)) {
    const selected = Array.isArray(value) ? (value as unknown[]) : []
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {item.options.map((opt) => {
          const active = selected.includes(opt.value)
          return (
            <Pressable
              key={String(opt.value)}
              onPress={() =>
                onChange(active ? selected.filter((v) => v !== opt.value) : [...selected, opt.value])
              }
              style={[
                styles.choiceChip,
                {
                  backgroundColor: active ? (colors.tint as string) : 'transparent',
                  borderColor: active ? (colors.tint as string) : (colors.text + '30'),
                },
              ]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
            >
              <Text style={{ color: active ? '#fff' : colors.text, fontSize: fontSize(12), fontWeight: fontWeight(active ? 600 : 500) as any }}>
                {opt.label}
              </Text>
            </Pressable>
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
        style={[styles.textInput, { color: colors.text, borderColor: colors.text + '30', backgroundColor: colors.card, minHeight: 40 }]}
      />
    )
  }
  // text
  return (
    <TextInput
      value={typeof value === 'string' ? value : ''}
      onChangeText={onChange}
      placeholder="Type your answer"
      placeholderTextColor={colors.subtext}
      multiline
      style={[styles.textInput, { color: colors.text, borderColor: colors.text + '30', backgroundColor: colors.card }]}
    />
  )
}

function ChoiceRow({
  label, options, value, onChange, colors, fontSize, fontWeight,
}: {
  label: string
  options: readonly string[]
  value: string
  onChange: (v: string) => void
  colors: { text: string; tint: string | undefined }
  fontSize: (n: number) => number
  fontWeight: (n: number) => string
}): React.JSX.Element {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
      <Text style={{ width: 110, color: colors.text, fontSize: fontSize(13) }}>{label}</Text>
      {options.map((opt) => {
        const active = value === opt
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            style={[
              styles.choiceChip,
              {
                backgroundColor: active ? (colors.tint as string) : 'transparent',
                borderColor: active ? (colors.tint as string) : (colors.text + '30'),
              },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={{ color: active ? '#fff' : colors.text, fontSize: fontSize(12), fontWeight: fontWeight(active ? 600 : 500) as any }}>
              {opt}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 12 },
  section: { marginHorizontal: 16, marginBottom: 12, borderRadius: 12 },
  choiceChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  textInput: {
    marginTop: 10,
    minHeight: 64,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  submitBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  completeWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  completeTitle: { marginTop: 12, textAlign: 'center' },
  doneBtn: { marginTop: 28, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 12 },
})
