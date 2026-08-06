/**
 * MedicationsBanner — Ken 2026-08-05
 *
 * Placement: directly below HabitsBanner on the BPS surface + the
 * legacy PlanScreenRedesignedV2 / unified-plan surfaces. Tap
 * navigates to /Home/medications (the medications screen).
 *
 * Replaces the small "Medications" pill previously in the tier row
 * of BiopsychosocialPlanScreen (SCRUM-658). A prominent banner reads
 * as a proper section entry rather than a chip lost in a control row.
 *
 * Design mirrors HabitsBanner's shape (48pt tinted icon + title
 * subtitle stack + chevron) but uses the green #199C4F accent that
 * matches the "Medical conditions & medications" report group — so
 * the plan surface, the report chunks, and this banner all share
 * the same medical-vs-mental-health color language.
 *
 * States rendered:
 *   - loading                → null (no flash between empty + populated)
 *   - no medications on file → "Add your medications" CTA
 *   - N medications on file  → "N active" (or similar) subtitle
 *
 * Props are optional so callers on non-BPS surfaces can mount without
 * threading theme. Defaults use the green report palette.
 *
 * iOS 26.5-safe primitive envelope (View / Text / Pressable /
 * MaterialIcons / StyleSheet).
 */

import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router } from 'expo-router'

import { usePlanMedications } from '@/hooks/use-plan-medications'

interface MedicationsBannerProps {
  colors?: Record<string, string>
  getScaledFontSize?: (n: number) => number
  getScaledFontWeight?: (n: number) => string | number
}

// Green #199C4F — matches the report's "Medical conditions & medications"
// group color (see intake-report-builder.ts GROUP_SPECS). Kept in sync
// manually — the report groups are the source of truth for the medical
// palette across the plan surface.
const DEFAULT_TINT = '#199C4F'
const DEFAULT_TEXT = '#11181C'
const DEFAULT_SUBTEXT = '#687076'

function MedicationsBannerBase({
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: MedicationsBannerProps): React.JSX.Element | null {
  const { data, isLoading } = usePlanMedications()

  if (isLoading) return null

  // The plan-medications record is the writable "current medications" list
  // (EHR-hydrated + patient-added rows). The medications screen also
  // renders a FHIR-derived past-status set alongside — but for the banner
  // count we only surface the writable list so the number matches what
  // the patient can add / edit / discontinue from here.
  const medications = data?.medications ?? []
  const count = medications.length
  const isEmpty = count === 0

  const tint = colors?.tint ?? DEFAULT_TINT
  const text = colors?.text ?? DEFAULT_TEXT
  const subtext = colors?.subtext ?? DEFAULT_SUBTEXT
  const sz = getScaledFontSize ?? ((n) => n)
  const wt = getScaledFontWeight ?? ((n) => String(n))

  return (
    <Pressable
      onPress={() => router.push('/Home/medications' as never)}
      accessibilityRole="button"
      accessibilityLabel={
        isEmpty
          ? 'Add your medications'
          : `Manage medications — ${count} on file`
      }
      accessibilityHint="Opens your medications screen"
      hitSlop={4}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: `${tint}14`,
          borderColor: `${tint}33`,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View
        style={[styles.iconWrap, { backgroundColor: `${tint}22`, borderColor: `${tint}44` }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <MaterialIcons name="medication" size={24} color={tint} />
      </View>

      <View style={styles.textCol}>
        <Text
          style={{
            color: text,
            fontSize: sz(16),
            fontWeight: wt(700) as any,
          }}
          numberOfLines={1}
        >
          {isEmpty ? 'Add your medications' : 'Your medications'}
        </Text>
        <Text
          style={{
            color: subtext,
            fontSize: sz(13),
            marginTop: 3,
            lineHeight: 18,
          }}
          numberOfLines={2}
        >
          {isEmpty
            ? 'Track everything you take — what you\'re on now and what you\'ve stopped.'
            : `${count} on file. Tap to view, add, or discontinue.`}
        </Text>
      </View>

      <MaterialIcons name="chevron-right" size={24} color={tint} />
    </Pressable>
  )
}

export const MedicationsBanner = React.memo(MedicationsBannerBase)
MedicationsBanner.displayName = 'MedicationsBanner'
export default MedicationsBanner

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textCol: {
    flex: 1,
    marginRight: 8,
  },
})
