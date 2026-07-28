/**
 * Wave 3 (2026-07-28) — grouped-checklist stepper for instruments whose
 * items are all `kind: 'multi'` and pre-bucketed by category (Ohio DDC
 * Leisure Interest is the first). Renders ONE screen per category with
 * every activity in that category shown inline as three tri-state chips
 * (matches the Ohio option set: `Used to enjoy` / `Currently enjoy` /
 * `Interested in trying`). Users can tap any subset of the three chips per
 * activity — the answer is stored as the same `unknown[]` array the
 * standard per-item multi flow uses, so `submitAssessment` and BE scoring
 * paths are unchanged.
 *
 * State is fully controlled by the parent (`AssessmentStepperScreen`) so
 * draft persistence and submit logic stay in one place. This component
 * owns only the local `categoryIdx` cursor.
 *
 * OTA-safe: uses standard RN primitives + MaterialIcons only (no native
 * fingerprint change per feedback_ota_runtime_version_rule.md).
 */

import React from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router } from 'expo-router'

import { Colors } from '@/constants/theme'
import type { InstrumentSummary, InstrumentItem } from '@/services/api/instruments'
import { groupItemsByCategory } from '@/lib/instrument-grouping'
import { getWarmerInstrumentLabel } from '@/lib/instrument-labels'

type Palette = typeof Colors['light'] | typeof Colors['dark']

interface Props {
  instrument: InstrumentSummary
  answers: Record<string, unknown>
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, unknown>>>
  onSubmit: () => void
  onCancel: () => void
  isSubmitting: boolean
  colors: Palette
  fontSize: (n: number) => number
  fontWeight: (n: number) => number | string
}

export function GroupedInstrumentStepper(props: Props): React.JSX.Element {
  const {
    instrument,
    answers,
    setAnswers,
    onSubmit,
    onCancel,
    isSubmitting,
    colors,
    fontSize,
    fontWeight,
  } = props

  const groups = React.useMemo(
    () => groupItemsByCategory(instrument.items),
    [instrument.items],
  )
  const total = groups.length

  const [categoryIdx, setCategoryIdx] = React.useState(0)
  // Guard against out-of-range cursor after an instrument change (mirrors
  // SCRUM-528 in the per-item stepper — a stale draft can carry an index
  // past a newly-shorter instrument's category list).
  React.useEffect(() => {
    if (categoryIdx >= total) setCategoryIdx(Math.max(0, total - 1))
  }, [total, categoryIdx])

  if (total === 0) {
    return (
      <View style={[styles.centerWrap, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.subtext, fontSize: fontSize(14) }}>No activities to show.</Text>
      </View>
    )
  }

  const current = groups[categoryIdx]
  const isLast = categoryIdx >= total - 1
  const isFirst = categoryIdx === 0

  const advance = () => {
    if (isLast) onSubmit()
    else setCategoryIdx((i) => Math.min(i + 1, total - 1))
  }

  const goBack = () => {
    if (isFirst) onCancel()
    else setCategoryIdx((i) => Math.max(i - 1, 0))
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => router.replace('/Home/assessments-catalog' as never)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close check-in"
        >
          <MaterialIcons name="close" size={fontSize(24)} color={colors.text} />
        </Pressable>
        <Text
          style={[
            styles.headerTitle,
            { color: colors.text, fontSize: fontSize(15), fontWeight: fontWeight(600) as any, marginLeft: 12 },
          ]}
          numberOfLines={1}
        >
          {getWarmerInstrumentLabel(instrument.instrumentId, instrument.name)}
        </Text>
      </View>

      <ProgressBar current={categoryIdx + 1} total={total} colors={colors} />

      <Text style={[styles.stepLabel, { color: colors.subtext, fontSize: fontSize(12) }]}>
        Category {categoryIdx + 1} of {total}
      </Text>

      <View
        style={[
          styles.card,
          { backgroundColor: (colors.card as string) + 'D9', borderColor: colors.border },
        ]}
      >
        <Text
          style={{
            color: colors.text,
            fontSize: fontSize(20),
            fontWeight: fontWeight(700) as any,
            lineHeight: fontSize(26),
          }}
        >
          {current.category}
        </Text>
        <Text
          style={{
            color: colors.subtext,
            fontSize: fontSize(12),
            marginTop: 6,
            lineHeight: 17,
          }}
        >
          For each activity, tap any that apply. Skip any that don&apos;t.
        </Text>

        <View style={{ marginTop: 16, gap: 14 }}>
          {current.items.map((item) => (
            <ActivityRow
              key={item.id}
              item={item}
              value={answers[item.id]}
              onChange={(next) =>
                setAnswers((prev) => ({ ...prev, [item.id]: next }))
              }
              colors={colors}
              fontSize={fontSize}
              fontWeight={fontWeight}
            />
          ))}
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={goBack}
          disabled={isSubmitting}
          style={[styles.secondaryBtn, { borderColor: colors.border }]}
          accessibilityRole="button"
        >
          <Text style={{ color: colors.text, fontSize: fontSize(14), fontWeight: fontWeight(600) as any }}>
            {isFirst ? 'Cancel' : 'Back'}
          </Text>
        </Pressable>
        <Pressable
          onPress={advance}
          disabled={isSubmitting}
          style={[
            styles.primaryBtn,
            { backgroundColor: colors.tint as string, opacity: isSubmitting ? 0.6 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Submit check-in' : `Continue to category ${categoryIdx + 2} of ${total}`}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontSize: fontSize(14), fontWeight: fontWeight(700) as any }}>
              {isLast ? 'Submit' : 'Next category'}
            </Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  )
}

interface ActivityRowProps {
  item: InstrumentItem
  value: unknown
  onChange: (next: number[]) => void
  colors: Palette
  fontSize: (n: number) => number
  fontWeight: (n: number) => number | string
}

function ActivityRow(props: ActivityRowProps): React.JSX.Element {
  const { item, value, onChange, colors, fontSize, fontWeight } = props
  const options = item.options ?? []
  const selected: number[] = Array.isArray(value) ? (value as number[]) : []

  const toggle = (v: number) => {
    if (selected.includes(v)) onChange(selected.filter((x) => x !== v))
    else onChange([...selected, v])
  }

  return (
    <View>
      <Text
        style={{
          color: colors.text,
          fontSize: fontSize(15),
          fontWeight: fontWeight(600) as any,
          marginBottom: 8,
          lineHeight: fontSize(20),
        }}
      >
        {item.text}
      </Text>
      <View style={styles.chipRow}>
        {options.map((opt) => {
          const isSelected = selected.includes(opt.value)
          return (
            <Pressable
              key={opt.value}
              onPress={() => toggle(opt.value)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={`${item.text} — ${opt.label}`}
              style={[
                styles.chip,
                {
                  backgroundColor: isSelected ? (colors.tint as string) : 'transparent',
                  borderColor: isSelected ? (colors.tint as string) : colors.border,
                },
              ]}
            >
              <Text
                style={{
                  color: isSelected ? '#FFFFFF' : colors.text,
                  fontSize: fontSize(12),
                  fontWeight: isSelected ? '700' : '500',
                }}
              >
                {opt.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

// Mirrors the ProgressBar in assessment-stepper.tsx — kept local so this
// component has no cross-file coupling with the per-item stepper (which
// would drag its render tree into this file's compilation unit).
function ProgressBar({
  current,
  total,
  colors,
}: {
  current: number
  total: number
  colors: Palette
}): React.JSX.Element {
  const pct = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0
  return (
    <View style={styles.progressWrap}>
      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.progressFill,
            { backgroundColor: colors.tint as string, width: `${pct}%` },
          ]}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerTitle: { flex: 1 },
  progressWrap: { paddingHorizontal: 16, paddingTop: 8 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%' },
  stepLabel: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 },
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 20,
  },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtn: {
    flex: 2,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
})
