/**
 * Nutrition plan section for the Plan screen.
 *
 * Ken 2026-08-07: "Do you think it's worth adding an additional section to
 * the bio part of the plan that we can call 'nutritional plan or support'.
 * I'm noticing from my information how important a nutritional assessment
 * and plan is to my and all of our health."
 *
 * ── GENERATE ON TAP, NOT ON MOUNT ────────────────────────────────────
 * Each generation is a Bedrock call and the backend does not persist the
 * result. Fetching on mount would bill a model call for every patient who
 * scrolls past this section. So it stays collapsed behind a button until
 * someone asks for it.
 *
 * ── WHAT THIS MUST NOT IMPLY ─────────────────────────────────────────
 * The screener yields FREQUENCIES ("how often"), never amounts — the NCI
 * regression coefficients that convert frequency to intake are not loaded
 * (see cos-backend/src/services/nutrition/dsq-scoring.service.ts). So the
 * copy here never says cups, grams or servings, and the care-team-review
 * notice is not dismissible: Ken's own source on AI in nutrition found
 * LLM diet plans show "variability in accuracy, safety, and
 * personalization, indicating the need for professional oversight."
 *
 * Stays inside the iOS 26.5 primitive envelope: View / Text / Pressable /
 * ActivityIndicator / MaterialIcons / StyleSheet.
 */

import React from 'react'
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'

import {
  generateNutritionPlan,
  NutritionFeatureDisabledError,
  NutritionEntitlementError,
  NutritionScreenerRequiredError,
  NutritionGenerationError,
  type NutritionPlan,
} from '@/services/api/nutrition-plan'

export interface NutritionPlanSectionProps {
  colors: { card: string; border: string; text: string; subtext: string; tint: string }
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
  /** Sends the patient to the assessments catalog to take the screener. */
  onTakeScreener: () => void
  containerStyle?: StyleProp<ViewStyle>
}

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; plan: NutritionPlan }
  | { kind: 'needs-screener'; message: string }
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

export function NutritionPlanSection({
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  onTakeScreener,
  containerStyle,
}: NutritionPlanSectionProps): React.ReactElement | null {
  const [status, setStatus] = React.useState<Status>({ kind: 'idle' })

  const onGenerate = React.useCallback(async () => {
    setStatus({ kind: 'loading' })
    try {
      const plan = await generateNutritionPlan()
      setStatus({ kind: 'ready', plan })
    } catch (err) {
      if (err instanceof NutritionFeatureDisabledError || err instanceof NutritionEntitlementError) {
        // Collapse silently. A patient whose plan does not include this
        // should not see a broken section, and neither should anyone when
        // the flag is off.
        setStatus({ kind: 'hidden' })
        return
      }
      if (err instanceof NutritionScreenerRequiredError) {
        setStatus({ kind: 'needs-screener', message: err.message })
        return
      }
      if (err instanceof NutritionGenerationError) {
        setStatus({ kind: 'error', message: err.message, retryable: true })
        return
      }
      setStatus({
        kind: 'error',
        message: 'Could not build your nutrition plan right now.',
        retryable: true,
      })
    }
  }, [])

  if (status.kind === 'hidden') return null

  const { card, border, text, subtext, tint } = colors
  const bold = getScaledFontWeight(700) as never

  return (
    <View style={[styles.card, { backgroundColor: card, borderColor: border }, containerStyle]}>
      <View style={styles.header}>
        <MaterialIcons name="restaurant" size={getScaledFontSize(18)} color="#16A34A" />
        <Text
          style={[
            styles.eyebrow,
            { color: subtext, fontSize: getScaledFontSize(11), fontWeight: bold, marginLeft: 8 },
          ]}
        >
          NUTRITION PLAN & SUPPORT
        </Text>
      </View>

      {status.kind === 'idle' && (
        <>
          <Text style={{ color: subtext, fontSize: getScaledFontSize(14), lineHeight: 20, marginTop: 8 }}>
            Build practical suggestions from your dietary screener — small changes
            based on what you told us you eat.
          </Text>
          <Pressable
            onPress={() => void onGenerate()}
            accessibilityRole="button"
            accessibilityLabel="Build my nutrition plan"
            style={[styles.cta, { backgroundColor: tint }]}
          >
            <Text style={{ color: '#fff', fontSize: getScaledFontSize(15), fontWeight: bold }}>
              Build my nutrition plan
            </Text>
          </Pressable>
        </>
      )}

      {status.kind === 'loading' && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={tint} />
          <Text style={{ color: subtext, fontSize: getScaledFontSize(14), marginLeft: 10 }}>
            Building your plan…
          </Text>
        </View>
      )}

      {status.kind === 'needs-screener' && (
        <>
          <Text style={{ color: text, fontSize: getScaledFontSize(14), lineHeight: 20, marginTop: 8 }}>
            {status.message}
          </Text>
          <Pressable
            onPress={onTakeScreener}
            accessibilityRole="button"
            accessibilityLabel="Take the dietary screener"
            style={[styles.cta, { backgroundColor: tint }]}
          >
            <Text style={{ color: '#fff', fontSize: getScaledFontSize(15), fontWeight: bold }}>
              Take the dietary screener
            </Text>
          </Pressable>
        </>
      )}

      {status.kind === 'error' && (
        <>
          <Text style={{ color: text, fontSize: getScaledFontSize(14), lineHeight: 20, marginTop: 8 }}>
            {status.message}
          </Text>
          {status.retryable && (
            <Pressable
              onPress={() => void onGenerate()}
              accessibilityRole="button"
              accessibilityLabel="Try again"
              style={[styles.cta, { backgroundColor: tint }]}
            >
              <Text style={{ color: '#fff', fontSize: getScaledFontSize(15), fontWeight: bold }}>
                Try again
              </Text>
            </Pressable>
          )}
        </>
      )}

      {status.kind === 'ready' && (
        <>
          {status.plan.summary !== '' && (
            <Text style={{ color: text, fontSize: getScaledFontSize(15), lineHeight: 22, marginTop: 8 }}>
              {status.plan.summary}
            </Text>
          )}

          {status.plan.suggestions.map((s, i) => (
            <View
              key={`${s.factor}-${i}`}
              style={[styles.suggestion, { borderColor: border }]}
            >
              <Text
                style={{
                  color: subtext,
                  fontSize: getScaledFontSize(11),
                  fontWeight: bold,
                  letterSpacing: 0.5,
                }}
              >
                {(FACTOR_LABEL[s.factor] ?? s.factor).toUpperCase()}
              </Text>
              <Text
                style={{
                  color: text,
                  fontSize: getScaledFontSize(15),
                  fontWeight: bold,
                  marginTop: 3,
                  lineHeight: 21,
                }}
              >
                {s.title}
              </Text>
              {s.rationale !== '' && (
                <Text
                  style={{ color: subtext, fontSize: getScaledFontSize(13), lineHeight: 19, marginTop: 3 }}
                >
                  {s.rationale}
                </Text>
              )}
            </View>
          ))}

          {/* NOT dismissible, and not conditional on anything the model
              returns. Dietary guidance interacts with medication and with
              conditions this generator cannot see. */}
          {status.plan.requiresCareTeamReview && (
            <View style={styles.reviewNote}>
              <MaterialIcons name="info-outline" size={getScaledFontSize(14)} color={subtext} />
              <Text
                style={{
                  color: subtext,
                  fontSize: getScaledFontSize(12),
                  lineHeight: 17,
                  marginLeft: 6,
                  flex: 1,
                }}
              >
                Suggestions based on what you reported eating — how often, not how
                much. Your care team reviews these before they become advice. Talk
                to them before making changes, especially if you take medication.
              </Text>
            </View>
          )}

          <Pressable
            onPress={() => void onGenerate()}
            accessibilityRole="button"
            accessibilityLabel="Rebuild my nutrition plan"
            style={styles.rebuild}
          >
            <Text style={{ color: tint, fontSize: getScaledFontSize(13), fontWeight: bold }}>
              Rebuild
            </Text>
          </Pressable>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  eyebrow: { letterSpacing: 1, textTransform: 'uppercase' },
  cta: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    // 44pt minimum touch target.
    minHeight: 44,
    justifyContent: 'center',
  },
  loadingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14, minHeight: 44 },
  suggestion: { marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  reviewNote: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 14 },
  rebuild: { marginTop: 12, alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
})
