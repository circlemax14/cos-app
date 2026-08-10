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
 * ActivityIndicator / MaterialIcons / StyleSheet).
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
        // should not see a broken card, and neither should anyone when the
        // backend flag is off.
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
        message: 'Could not build your nutrition plan right now. Tap to try again.',
        retryable: true,
      })
    }
  }, [])

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
    // Deliberately NOT `status.message` — the backend says "Take the dietary
    // screener first", which just repeats the title. Say what the thing
    // actually is instead, so nobody taps into a questionnaire blind.
    title = 'Take the dietary screener'
    subtitle = 'A short food-frequency questionnaire — about 5 minutes. Your plan is built from it.'
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
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={a11yHint}
      hitSlop={4}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: `${tint}1F`,
          borderColor: `${tint}55`,
          opacity: pressed && status.kind !== 'loading' ? 0.85 : 1,
        },
        containerStyle,
      ]}
    >
      <View style={styles.headerRow}>
        <View
          style={[styles.iconWrap, { backgroundColor: tint, borderColor: tint }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <MaterialIcons name="restaurant" size={24} color="#FFFFFF" />
        </View>

        <View style={styles.textCol}>
          <Text style={{ color: text, fontSize: sz(16), fontWeight: bold }} numberOfLines={1}>
            {title}
          </Text>
          <Text
            style={{ color: subtext, fontSize: sz(13), marginTop: 3, lineHeight: 18 }}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        </View>

        {status.kind === 'loading' ? (
          <ActivityIndicator color={tint} />
        ) : (
          <MaterialIcons
            name={isReady ? 'refresh' : 'chevron-right'}
            size={sz(22)}
            color={subtext}
          />
        )}
      </View>

      {isReady && (
        <View style={[styles.previewSection, { borderTopColor: `${tint}44` }]}>
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
    </Pressable>
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
  headerRow: { flexDirection: 'row', alignItems: 'center' },
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
  previewSection: { marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  previewRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 5 },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, marginRight: 10, marginTop: 6 },
  previewText: { flex: 1 },
  reviewNote: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 10 },
})
