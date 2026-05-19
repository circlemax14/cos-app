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
import { router } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import {
  fetchAssessmentPrefill,
  submitAssessment,
  type PrefillSummary,
} from '@/services/api/assessments'
import { usePlanType, meetsTier } from '@/hooks/use-plan-type'

// PHQ-2 has 2 items, each 0-3. Sum ≥3 triggers PHQ-9.
const PHQ2_ITEMS = [
  'Little interest or pleasure in doing things?',
  'Feeling down, depressed, or hopeless?',
] as const

// PHQ-9 adds 7 more items (we deliver the full 9 when PHQ-2 is positive)
const PHQ9_EXTRA_ITEMS = [
  'Trouble falling or staying asleep, or sleeping too much?',
  'Feeling tired or having little energy?',
  'Poor appetite or overeating?',
  'Feeling bad about yourself — or that you are a failure?',
  'Trouble concentrating on things like reading or watching TV?',
  'Moving or speaking slowly, or being fidgety / restless?',
  'Thoughts that you would be better off dead, or hurting yourself?',
] as const

const FREQ_OPTIONS = [
  { value: 0, label: 'Not at all' },
  { value: 1, label: 'Several days' },
  { value: 2, label: 'More than half the days' },
  { value: 3, label: 'Nearly every day' },
] as const

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

  // Local UI state per section
  const [wellbeing, setWellbeing] = React.useState<number>(7)
  const [smoking, setSmoking] = React.useState<string>('never')
  const [alcohol, setAlcohol] = React.useState<string>('rarely')
  const [exercise, setExercise] = React.useState<string>('1-2x/week')
  const [sleepHours, setSleepHours] = React.useState<number>(7)
  const [phqAnswers, setPhqAnswers] = React.useState<number[]>([])
  const [goals, setGoals] = React.useState<string[]>([])
  const [goalFreeText, setGoalFreeText] = React.useState<string>('')
  const [submitted, setSubmitted] = React.useState<boolean>(false)

  const phq2Sum = (phqAnswers[0] ?? 0) + (phqAnswers[1] ?? 0)
  const needsPhq9 = phq2Sum >= 3
  const phqItems = needsPhq9 ? [...PHQ2_ITEMS, ...PHQ9_EXTRA_ITEMS] : PHQ2_ITEMS

  const submit = useMutation({
    mutationFn: async () => {
      // Submit each instrument independently. The plan generator will pick
      // them all up on the next regen.
      await Promise.all([
        submitAssessment('wellbeing', { value: wellbeing }),
        submitAssessment('lifestyle', { smoking, alcohol, exercise, sleepHours }),
        submitAssessment(needsPhq9 ? 'phq-9' : 'phq-2', phqAnswers.reduce<Record<string, number>>(
          (acc, v, i) => { acc[`q${i + 1}`] = v; return acc }, {},
        )),
        submitAssessment('goals', { selected: goals, freeText: goalFreeText.trim() }),
      ])
    },
    onSuccess: () => {
      setSubmitted(true)
      queryClient.invalidateQueries({ queryKey: ['assessments'] })
      queryClient.invalidateQueries({ queryKey: ['ai-health-plan'] })
    },
  })

  const allRequiredAnswered =
    phqAnswers.length === phqItems.length &&
    phqAnswers.every((v) => v !== undefined) &&
    goals.length > 0

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
            onPress={() => router.back()}
            style={[styles.doneBtn, { backgroundColor: colors.tint as string }]}
            accessibilityRole="button"
          >
            <Text style={{ color: '#fff', fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any }}>Done</Text>
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

        {/* Well-being */}
        <Section title="How are you feeling today?" colors={colors} fontSize={getScaledFontSize} fontWeight={getScaledFontWeight}>
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginBottom: 8 }}>
            Tap a number from 1 (rough) to 10 (great).
          </Text>
          <ScaleRow value={wellbeing} onChange={setWellbeing} colors={colors} fontSize={getScaledFontSize} fontWeight={getScaledFontWeight} />
        </Section>

        {/* Lifestyle */}
        <Section title="A few lifestyle questions" colors={colors} fontSize={getScaledFontSize} fontWeight={getScaledFontWeight}>
          <ChoiceRow label="Smoking" options={['never', 'former', 'occasional', 'daily']} value={smoking} onChange={setSmoking} colors={colors} fontSize={getScaledFontSize} fontWeight={getScaledFontWeight} />
          <ChoiceRow label="Alcohol" options={['never', 'rarely', 'weekly', 'daily']} value={alcohol} onChange={setAlcohol} colors={colors} fontSize={getScaledFontSize} fontWeight={getScaledFontWeight} />
          <ChoiceRow label="Exercise" options={['none', '1-2x/week', '3-4x/week', 'daily']} value={exercise} onChange={setExercise} colors={colors} fontSize={getScaledFontSize} fontWeight={getScaledFontWeight} />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            <Text style={{ width: 110, color: colors.text, fontSize: getScaledFontSize(13) }}>Sleep (hrs)</Text>
            <ScaleRow value={sleepHours} min={4} max={12} onChange={setSleepHours} colors={colors} fontSize={getScaledFontSize} fontWeight={getScaledFontWeight} />
          </View>
        </Section>

        {/* PHQ-2 / PHQ-9 */}
        <Section title="Over the last 2 weeks, how often have you been bothered by…" colors={colors} fontSize={getScaledFontSize} fontWeight={getScaledFontWeight}>
          {phqItems.map((q, i) => (
            <View key={i} style={{ marginBottom: 12 }}>
              <Text style={{ color: colors.text, fontSize: getScaledFontSize(13), marginBottom: 6 }}>{i + 1}. {q}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {FREQ_OPTIONS.map((opt) => {
                  const active = phqAnswers[i] === opt.value
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setPhqAnswers((prev) => {
                        const next = [...prev]
                        next[i] = opt.value
                        return next
                      })}
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
                      <Text style={{ color: active ? '#fff' : colors.text, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(active ? 600 : 500) as any }}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>
          ))}
          {needsPhq9 ? (
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11), fontStyle: 'italic', marginTop: 6 }}>
              We added a few more questions based on your earlier responses.
            </Text>
          ) : null}
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

function ScaleRow({
  value, min = 1, max = 10, onChange, colors, fontSize, fontWeight,
}: {
  value: number
  min?: number
  max?: number
  onChange: (n: number) => void
  colors: { text: string; tint: string | undefined }
  fontSize: (n: number) => number
  fontWeight: (n: number) => string
}): React.JSX.Element {
  const cells = []
  for (let i = min; i <= max; i++) cells.push(i)
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
      {cells.map((n) => {
        const active = value === n
        return (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            style={[
              styles.scaleCell,
              {
                backgroundColor: active ? (colors.tint as string) : 'transparent',
                borderColor: active ? (colors.tint as string) : (colors.text + '30'),
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${n}`}
            accessibilityState={{ selected: active }}
          >
            <Text style={{ color: active ? '#fff' : colors.text, fontSize: fontSize(13), fontWeight: fontWeight(active ? 700 : 500) as any }}>
              {n}
            </Text>
          </Pressable>
        )
      })}
    </View>
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
  scaleCell: {
    minWidth: 32,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
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
