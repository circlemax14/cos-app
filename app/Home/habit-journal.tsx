/**
 * SCRUM-640 — Habit Journal screen.
 *
 * Gated by `useHabitJournalFlag()`. While the backend flag is OFF
 * (dark launch) this screen is unreachable (settings row hidden, and
 * direct-nav renders a "not available" state — mirror of the nudges
 * dark-launch behavior in app/Home/nudges.tsx).
 *
 * Wired to cos-backend routes:
 *   GET  /v1/habits/catalog          — habit list to render
 *   GET  /v1/habits/entries/today    — prefill today's values + streaks
 *   POST /v1/habits/entries          — batched upsert on Save
 *   GET  /v1/habits/correlation      — shown at bottom as an at-a-glance
 *                                       Pearson strip (same component as
 *                                       the BPS card mount)
 *
 * <15s daily-entry target: one screen, no modal-per-habit. Local
 * `draft` map accumulates edits; a single POST fires on Save with
 * batched entries. Optimistic React Query cache update means the
 * user sees streak deltas within a frame of the network round-trip.
 */

import React from 'react'
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native'
import { Card } from 'react-native-paper'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router } from 'expo-router'

import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { useHabitJournalFlag } from '@/hooks/use-habit-journal-flag'
import {
  useHabitCatalog,
  useHabitEntriesToday,
  useUpsertHabitEntries,
} from '@/hooks/use-habit-journal'
import type {
  HabitCatalogItem,
  HabitEntry,
  HabitStreak,
} from '@/services/api/habit-journal'
import { HabitCorrelationStrip } from '@/components/health-plan/HabitCorrelationStrip'
import { todayLocalIso } from '@/lib/day-key';

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

type DraftValue = number | boolean

interface DraftMap {
  [habitId: string]: DraftValue
}

const SCALE_MIN = 1
const SCALE_MAX = 5

// Coarse initial defaults for numeric habits (used when there's no prior
// entry today). Kept small so the +/- steppers get to a useful value fast.
const NUMERIC_STEP: Record<string, number> = {
  hydration_oz: 8,       // one glass
  caffeine_mg: 50,       // roughly half a cup of coffee
  sleep_hygiene_score: 1, // scale
  screen_time_hours: 1,
  sunlight_minutes: 15,
  mood_today: 1,          // scale
}

function stepFor(habit: HabitCatalogItem): number {
  return NUMERIC_STEP[habit.habitId] ?? 1
}

function initialValueFor(habit: HabitCatalogItem, existing?: HabitEntry): DraftValue {
  if (existing !== undefined) return existing.value
  if (habit.inputType === 'boolean') return false
  if (habit.inputType === 'scale') return SCALE_MIN
  return 0
}

export default function HabitJournalScreen(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const flagEnabled = useHabitJournalFlag()

  const catalogQuery = useHabitCatalog()
  const todayQuery = useHabitEntriesToday()
  const upsertMutation = useUpsertHabitEntries()

  const [draft, setDraft] = React.useState<DraftMap>({})
  const [hydrated, setHydrated] = React.useState(false)

  // Seed the draft from server prefill exactly once per screen mount so
  // typing doesn't get clobbered on refetch (same pattern as legacy
  // record-metric-modal).
  React.useEffect(() => {
    if (hydrated) return
    if (!catalogQuery.data || !todayQuery.data) return
    const byId: Record<string, HabitEntry> = {}
    for (const e of todayQuery.data.entries) byId[e.habitId] = e
    const seeded: DraftMap = {}
    for (const habit of catalogQuery.data) {
      seeded[habit.habitId] = initialValueFor(habit, byId[habit.habitId])
    }
    setDraft(seeded)
    setHydrated(true)
  }, [catalogQuery.data, todayQuery.data, hydrated])

  if (!flagEnabled) {
    return (
      <AppWrapper>
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <ScreenHeader
            title="Daily habits"
            onBack={() => router.back()}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
          />
          <View style={{ padding: 24 }}>
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14) }}>
              This feature is not available yet.
            </Text>
          </View>
        </View>
      </AppWrapper>
    )
  }

  const catalog = (catalogQuery.data ?? []).slice().sort(
    (a, b) => a.displayOrder - b.displayOrder,
  )
  const streaksById = new Map<string, HabitStreak>()
  for (const s of todayQuery.data?.streaks ?? []) streaksById.set(s.habitId, s)

  const isLoading = catalogQuery.isLoading || todayQuery.isLoading
  const localDate = todayQuery.data?.localDate ?? todayLocalIso()

  function setValue(habitId: string, next: DraftValue) {
    setDraft((prev) => ({ ...prev, [habitId]: next }))
  }

  async function onSave() {
    if (!catalog.length) return
    // Only send habits the user actually touched or that have a nonzero
    // value — avoids logging noise for defaults the user ignored.
    const entries = catalog
      .map((habit) => {
        const v = draft[habit.habitId]
        if (v === undefined) return null
        if (habit.inputType === 'boolean') {
          if (v === false) return null
          return { habitId: habit.habitId, value: true as boolean, unit: habit.unit }
        }
        if (typeof v !== 'number' || Number.isNaN(v)) return null
        if (v === 0) return null
        return { habitId: habit.habitId, value: v, unit: habit.unit }
      })
      .filter((x): x is { habitId: string; value: number | boolean; unit: string } => x !== null)

    if (entries.length === 0) {
      Alert.alert(
        'Nothing to save yet',
        'Tap or step up any habit you did today, then hit Save.',
      )
      return
    }

    try {
      const res = await upsertMutation.mutateAsync(entries)
      const milestone = res.streaks.find((s) => s.milestoneHit)
      if (milestone) {
        Alert.alert(
          `${milestone.milestoneHit}-day streak!`,
          'Nice consistency — keep going.',
        )
      }
    } catch (err: unknown) {
      Alert.alert('Could not save', extractErrorMessage(err))
    }
  }

  return (
    <AppWrapper>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader
          title="Daily habits"
          onBack={() => router.back()}
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginBottom: 6 }}>
            {localDate}
          </Text>
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginBottom: 14, lineHeight: 19 }}>
            Log the day in under a minute. We use these to spot directional
            patterns — never as clinical facts.
          </Text>

          {isLoading || !hydrated ? (
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginTop: 12 }}>
              Loading…
            </Text>
          ) : catalog.length === 0 ? (
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginTop: 12 }}>
              No habits configured. Please try again later.
            </Text>
          ) : (
            <>
              {catalog.map((habit) => (
                <HabitRow
                  key={habit.habitId}
                  habit={habit}
                  value={draft[habit.habitId] ?? initialValueFor(habit)}
                  onChange={(v) => setValue(habit.habitId, v)}
                  streak={streaksById.get(habit.habitId)}
                  colors={colors}
                  getScaledFontSize={getScaledFontSize}
                  getScaledFontWeight={getScaledFontWeight}
                />
              ))}

              <Pressable
                onPress={onSave}
                disabled={upsertMutation.isPending}
                accessibilityRole="button"
                accessibilityLabel="Save today's habits"
                style={({ pressed }) => [
                  styles.saveButton,
                  {
                    backgroundColor: colors.tint as string,
                    opacity: pressed || upsertMutation.isPending ? 0.75 : 1,
                  },
                ]}
              >
                <Text
                  style={{
                    color: '#fff',
                    fontSize: getScaledFontSize(15),
                    fontWeight: getScaledFontWeight(700) as any,
                  }}
                >
                  {upsertMutation.isPending ? 'Saving…' : 'Save'}
                </Text>
              </Pressable>

              <View style={{ marginTop: 24 }}>
                <HabitCorrelationStrip testID="habit-correlation-strip-journal" />
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </AppWrapper>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────

interface HeaderProps {
  title: string
  onBack: () => void
  colors: typeof Colors.light
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
}

function ScreenHeader({
  title, onBack, colors, getScaledFontSize, getScaledFontWeight,
}: HeaderProps): React.JSX.Element {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
        <MaterialIcons name="arrow-back" size={getScaledFontSize(24)} color={colors.text} />
      </Pressable>
      <Text
        style={{
          color: colors.text,
          fontSize: getScaledFontSize(22),
          fontWeight: getScaledFontWeight(700) as any,
          marginLeft: 12,
          flex: 1,
        }}
      >
        {title}
      </Text>
    </View>
  )
}

interface HabitRowProps {
  habit: HabitCatalogItem
  value: DraftValue
  onChange: (next: DraftValue) => void
  streak?: HabitStreak
  colors: typeof Colors.light
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
}

function HabitRow({
  habit, value, onChange, streak, colors, getScaledFontSize, getScaledFontWeight,
}: HabitRowProps): React.JSX.Element {
  return (
    <Card style={[styles.row, { backgroundColor: colors.card }]}>
      <Card.Content style={styles.rowContent}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(600) as any }}>
            {habit.label}
          </Text>
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11), marginTop: 2 }}>
            {habit.unit}
            {streak && streak.currentStreak > 0
              ? ` · ${streak.currentStreak}-day streak`
              : ''}
          </Text>
        </View>

        {habit.inputType === 'boolean' ? (
          <Switch
            value={value === true}
            onValueChange={(v) => onChange(v)}
            accessibilityLabel={`${habit.label} ${value === true ? 'yes' : 'no'}`}
          />
        ) : habit.inputType === 'scale' ? (
          <ScaleDots
            value={typeof value === 'number' ? value : SCALE_MIN}
            onChange={(v) => onChange(v)}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
          />
        ) : (
          <NumericStepper
            value={typeof value === 'number' ? value : 0}
            step={stepFor(habit)}
            onChange={(v) => onChange(v)}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
          />
        )}
      </Card.Content>
    </Card>
  )
}

interface ScaleDotsProps {
  value: number
  onChange: (v: number) => void
  colors: typeof Colors.light
  getScaledFontSize: (n: number) => number
}

function ScaleDots({ value, onChange, colors, getScaledFontSize }: ScaleDotsProps): React.JSX.Element {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {Array.from({ length: SCALE_MAX - SCALE_MIN + 1 }).map((_, idx) => {
        const dotValue = SCALE_MIN + idx
        const selected = dotValue <= value
        return (
          <Pressable
            key={dotValue}
            onPress={() => onChange(dotValue)}
            accessibilityRole="button"
            accessibilityLabel={`Set to ${dotValue} of ${SCALE_MAX}`}
            hitSlop={6}
            style={({ pressed }) => ({
              width: getScaledFontSize(20),
              height: getScaledFontSize(20),
              borderRadius: getScaledFontSize(10),
              backgroundColor: selected ? (colors.tint as string) : ((colors.tint as string) + '22'),
              opacity: pressed ? 0.7 : 1,
            })}
          />
        )
      })}
    </View>
  )
}

interface NumericStepperProps {
  value: number
  step: number
  onChange: (v: number) => void
  colors: typeof Colors.light
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
}

function NumericStepper({
  value, step, onChange, colors, getScaledFontSize, getScaledFontWeight,
}: NumericStepperProps): React.JSX.Element {
  const dec = () => onChange(Math.max(0, value - step))
  const inc = () => onChange(value + step)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <StepperButton
        icon="remove"
        onPress={dec}
        disabled={value <= 0}
        colors={colors}
        getScaledFontSize={getScaledFontSize}
      />
      <Text
        style={{
          color: colors.text,
          fontSize: getScaledFontSize(18),
          fontWeight: getScaledFontWeight(700) as any,
          minWidth: 48,
          textAlign: 'center',
        }}
        accessibilityLabel={`Current value ${value}`}
      >
        {value}
      </Text>
      <StepperButton
        icon="add"
        onPress={inc}
        disabled={false}
        colors={colors}
        getScaledFontSize={getScaledFontSize}
      />
    </View>
  )
}

interface StepperButtonProps {
  icon: 'add' | 'remove'
  onPress: () => void
  disabled: boolean
  colors: typeof Colors.light
  getScaledFontSize: (n: number) => number
}

function StepperButton({ icon, onPress, disabled, colors, getScaledFontSize }: StepperButtonProps): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={icon === 'add' ? 'Increase' : 'Decrease'}
      style={({ pressed }) => [
        {
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: (colors.tint as string) + (disabled ? '11' : '22'),
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      <MaterialIcons
        name={icon}
        size={getScaledFontSize(20)}
        color={disabled ? colors.subtext : (colors.tint as string)}
      />
    </Pressable>
  )
}

function extractErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string') {
    return (err as any).message
  }
  return 'Please try again.'
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 12 },
  row: { marginBottom: 12, borderRadius: 12 },
  rowContent: { flexDirection: 'row', alignItems: 'center' },
  saveButton: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
