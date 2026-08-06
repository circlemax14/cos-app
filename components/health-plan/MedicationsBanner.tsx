/**
 * MedicationsBanner — Ken 2026-08-05, expanded 2026-08-06.
 *
 * Placement: directly below HabitsBanner on the BPS surface + the
 * legacy PlanScreenRedesignedV2 / unified-plan surfaces. Tap anywhere
 * on the card navigates to /Home/medications.
 *
 * Replaces both the small "Medications" pill previously in the tier
 * row of BiopsychosocialPlanScreen (SCRUM-658) AND the standalone
 * TodaysMedicationsCard (previously mounted on the medications
 * screen). One entry point does both jobs: it announces the section
 * AND surfaces the next few doses so patients see today's schedule
 * without opening the detail screen.
 *
 * Design mirrors HabitsBanner's shape (48pt tinted icon + title +
 * subtitle stack + chevron) with the green #199C4F accent from the
 * report's "Medical conditions & medications" group. When the patient
 * has active meds with scheduled times, the banner expands with a
 * horizontal divider + up to 2 upcoming-dose rows (name — plain-english
 * time), plus a "+ N more today" line when there are more.
 *
 * States rendered:
 *   - loading                          → null (no flash between empty/populated)
 *   - no medications on file           → compact "Add your medications" CTA
 *   - active meds with times[]         → expanded card with 1-2 dose rows
 *   - active meds without times[]      → compact "N on file" subtitle only
 *
 * iOS 26.5-safe primitive envelope (View / Text / Pressable /
 * MaterialIcons / StyleSheet).
 */

import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router } from 'expo-router'

import { usePlanMedications } from '@/hooks/use-plan-medications'
import type { Medication } from '@/services/api/plan-medications'

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

// Ken 2026-08-06 — how many upcoming-dose rows to inline in the banner
// before we collapse the rest into a "+ N more today" line. 2 keeps the
// banner shorter than a full editor card while still giving the patient
// a sense of "here's what's next." Increase cautiously — 3+ rows and
// the banner starts to compete visually with the plan cards below.
const MAX_DOSE_PREVIEW_ROWS = 2

/**
 * Plain-English "Morning · 8:00 AM" style timing line for a single med.
 * Copied from TodaysMedicationsCard so this banner can render its own
 * dose preview without pulling that whole card component. Buckets by
 * first time-of-day; falls back to a "Morning · as prescribed" phrase
 * when the med has no `times[]` entries.
 */
function formatTiming(med: Medication): string {
  const t = (med.times ?? [])[0]
  if (!t || !/^\d{1,2}:\d{2}$/.test(t)) {
    return med.frequency ?? 'As prescribed'
  }
  const [hh, mm] = t.split(':')
  const h = parseInt(hh ?? '0', 10)
  const isPm = h >= 12
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h
  const bucket = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening'
  return `${bucket} · ${displayHour}:${mm} ${isPm ? 'PM' : 'AM'}`
}

/** Chronological sort key for a med — earliest time first. */
function firstTimeKey(med: Medication): string {
  return (med.times ?? [])[0] ?? '99:99'
}

function MedicationsBannerBase({
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: MedicationsBannerProps): React.JSX.Element | null {
  const { data, isLoading } = usePlanMedications()

  if (isLoading) return null

  const medications = data?.medications ?? []
  const count = medications.length
  const isEmpty = count === 0

  // Order the meds by first scheduled time so the banner's dose preview
  // reads chronologically (Morning first, then Afternoon, then Evening).
  // Skips meds with no times[] — they'd read as "as prescribed" and
  // clutter the preview without adding schedule info.
  const scheduledMeds = React.useMemo(() => {
    return medications
      .filter((m) => (m.times ?? []).length > 0)
      .slice()
      .sort((a, b) => firstTimeKey(a).localeCompare(firstTimeKey(b)))
  }, [medications])
  const previewMeds = scheduledMeds.slice(0, MAX_DOSE_PREVIEW_ROWS)
  const extraCount = Math.max(0, scheduledMeds.length - previewMeds.length)

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
      <View style={styles.headerRow}>
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
      </View>

      {/* Ken 2026-08-06 — upcoming-dose preview folded in from the
          retired TodaysMedicationsCard. Only rendered when at least
          one active med has a scheduled time[]; keeps the banner
          compact for patients with add-and-forget meds. */}
      {previewMeds.length > 0 ? (
        <View style={[styles.previewSection, { borderTopColor: `${tint}33` }]}>
          {previewMeds.map((m) => (
            <View key={m.id} style={styles.previewRow}>
              <View style={[styles.doseDot, { backgroundColor: `${tint}44`, borderColor: tint }]} />
              <Text
                style={{
                  flex: 1,
                  color: text,
                  fontSize: sz(13),
                  fontWeight: wt(600) as any,
                }}
                numberOfLines={1}
              >
                {m.name}
              </Text>
              <Text
                style={{
                  color: subtext,
                  fontSize: sz(12),
                  marginLeft: 8,
                }}
                numberOfLines={1}
              >
                {formatTiming(m)}
              </Text>
            </View>
          ))}
          {extraCount > 0 ? (
            <Text
              style={{
                color: tint,
                fontSize: sz(12),
                fontWeight: wt(600) as any,
                marginTop: 6,
                marginLeft: 22,
              }}
            >
              + {extraCount} more today
            </Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  )
}

export const MedicationsBanner = React.memo(MedicationsBannerBase)
MedicationsBanner.displayName = 'MedicationsBanner'
export default MedicationsBanner

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  previewSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
  },
  doseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    marginRight: 10,
  },
})
