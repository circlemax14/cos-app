/**
 * BioGoalEditorModal (COS-433) — presentational Modal for editing a
 * biopsychosocial plan goal.
 *
 * Extracted from `BiopsychosocialPlanScreen.tsx` as part of the iOS 26.5
 * `expo.controller.errorRecoveryQueue` crash experiment (see project_ios26_
 * biopsychosocial_parked.md). The parked-memory forensic identified that
 * legacy's goal-editor Modal lives on the long-resident `health-plan.tsx`
 * grandparent and therefore is *already in the tree* before the bio/legacy
 * branch decision, whereas bio's Modal was owned by its own freshly-mounted
 * subtree — creating a "new native Modal host + new query fetch, same
 * component, same commit" pattern that legacy structurally can't produce.
 * This component moves the Modal's presentation out of the bio subtree so
 * the grandparent can own its state + render location; bio becomes a pure
 * presentational component like legacy.
 *
 * Presentation-only, no data ownership, no hooks that fetch — all state
 * and callbacks come from props (`health-plan.tsx`). Uses the same
 * primitives legacy's editor Modal already uses (Modal, TextInput,
 * Pressable, ScrollView, MaterialIcons) — no new
 * native surface.
 */
import React from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'

import { Radii, Spacing } from '@/constants/design-system'
import {
  BPS_SUBDOMAINS,
  knownSubdomains,
  subdomainsByDomain,
  type BpsDomain,
} from '@/lib/bps-subdomains'
import { useUpdateBioGoal } from '@/hooks/use-biopsychosocial-plan'
import type { MeasurableGoal } from '@/services/api/biopsychosocial-plan'
import type { GoalPatch } from '@/services/api/ai-health-plan'

type ColorMap = Record<string, string>

export interface BioGoalEditorModalProps {
  visible: boolean
  colors: ColorMap
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string

  // Field values (controlled from parent).
  title: string
  description: string
  target: string
  timeframe: string
  subdomains: readonly string[]

  // Field setters + toggle.
  onChangeTitle: (v: string) => void
  onChangeDescription: (v: string) => void
  onChangeTarget: (v: string) => void
  onChangeTimeframe: (v: string) => void
  onToggleSubdomain: (key: string) => void

  // Actions.
  onClose: () => void
  onSave: () => void
  saving: boolean
}

/**
 * CHUNK 53 (2026-07-22): self-contained variant used by the consolidated
 * BPS editor Modal in BiopsychosocialPlanScreen. Owns its own draft state
 * (seeded from `goal` on mount) and its own useUpdateBioGoal mutation, so
 * the parent doesn't need to thread five state cells + a mutation down.
 * Save is fire-and-forget same-tick close (chunk 41 pattern) — no
 * Alert.alert, no await, iOS 26.5 safe. Behavior identical to the controlled
 * default-export BioGoalEditorModal.
 */
export interface BioGoalEditorBodyProps {
  goal: MeasurableGoal
  colors: ColorMap
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
  onClose: () => void
}

export function BioGoalEditorBody(props: BioGoalEditorBodyProps): React.JSX.Element {
  const { goal, colors, getScaledFontSize, getScaledFontWeight, onClose } = props

  // Self-owned draft state — seeded once on mount from goal. Body is
  // remounted each time the consolidated Modal switches into 'bio-goal'
  // kind (see BiopsychosocialPlanScreen key strategy), so mount === fresh
  // session and no in-flight mutation state can leak across editors.
  const [title, setTitle] = React.useState(goal.title)
  const [description, setDescription] = React.useState(goal.description ?? '')
  const [target, setTarget] = React.useState(goal.target ?? '')
  const [timeframe, setTimeframe] = React.useState(goal.timeframe ?? '')
  const [subdomains, setSubdomains] = React.useState<string[]>(() =>
    knownSubdomains(goal.subdomains),
  )

  const updateBioGoalMutation = useUpdateBioGoal()

  const onToggleSubdomain = React.useCallback((key: string) => {
    setSubdomains((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }, [])

  // CHUNK 41 pattern: fire-and-forget save then close same tick.
  const onSave = React.useCallback(() => {
    const patch: GoalPatch = {}
    if (title !== goal.title) patch.title = title
    if (description !== (goal.description ?? '')) patch.description = description
    if (target !== (goal.target ?? '')) patch.target = target
    if (timeframe !== (goal.timeframe ?? '')) patch.timeframe = timeframe
    const currentSubs = knownSubdomains(goal.subdomains)
    if (
      currentSubs.length !== subdomains.length ||
      currentSubs.some((k, i) => k !== subdomains[i])
    ) {
      patch.subdomains = subdomains
    }
    updateBioGoalMutation.mutate({ goalId: goal.id, patch })
    onClose()
  }, [goal, title, description, target, timeframe, subdomains, updateBioGoalMutation, onClose])

  return (
    <BioGoalEditorBodyPresentation
      colors={colors}
      getScaledFontSize={getScaledFontSize}
      getScaledFontWeight={getScaledFontWeight}
      title={title}
      description={description}
      target={target}
      timeframe={timeframe}
      subdomains={subdomains}
      onChangeTitle={setTitle}
      onChangeDescription={setDescription}
      onChangeTarget={setTarget}
      onChangeTimeframe={setTimeframe}
      onToggleSubdomain={onToggleSubdomain}
      onClose={onClose}
      onSave={onSave}
      saving={updateBioGoalMutation.isPending}
    />
  )
}

/**
 * Presentational-only inner — the exact JSX that used to live inside the
 * default BioGoalEditorModal, minus the outer <Modal>. Consumed by both
 * the controlled BioGoalEditorModal (for back-compat callers) and the
 * self-contained BioGoalEditorBody above.
 */
type BioGoalEditorBodyPresentationProps = Omit<BioGoalEditorModalProps, 'visible'>

function BioGoalEditorBodyPresentation(
  props: BioGoalEditorBodyPresentationProps,
): React.JSX.Element {
  const {
    colors,
    getScaledFontSize,
    getScaledFontWeight,
    title,
    description,
    target,
    timeframe,
    subdomains,
    onChangeTitle,
    onChangeDescription,
    onChangeTarget,
    onChangeTimeframe,
    onToggleSubdomain,
    onClose,
    onSave,
    saving,
  } = props

  return (
    <View style={styles.overlay}>
      <View style={[styles.sheet, { backgroundColor: colors.card ?? colors.background }]}>
        <View style={styles.header}>
          <Text
            style={[
              styles.headerTitle,
              {
                color: colors.text,
                fontSize: getScaledFontSize(16),
                fontWeight: getScaledFontWeight(700) as any,
              },
            ]}
          >
            Edit Goal
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={22} color={colors.subtext} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollArea} keyboardShouldPersistTaps="handled">
          <Text style={[styles.fieldLabel, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>TITLE</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            value={title}
            onChangeText={onChangeTitle}
            maxLength={120}
            placeholder="Goal title"
            placeholderTextColor={colors.subtext}
          />

          <Text style={[styles.fieldLabel, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>DESCRIPTION</Text>
          <TextInput
            style={[styles.input, styles.multiline, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            value={description}
            onChangeText={onChangeDescription}
            maxLength={300}
            multiline
            numberOfLines={3}
            placeholder="Description"
            placeholderTextColor={colors.subtext}
          />

          <Text style={[styles.fieldLabel, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>TARGET</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            value={target}
            onChangeText={onChangeTarget}
            maxLength={40}
            placeholder="Goal value"
            placeholderTextColor={colors.subtext}
          />

          <Text style={[styles.fieldLabel, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>TIMEFRAME</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            value={timeframe}
            onChangeText={onChangeTimeframe}
            maxLength={40}
            placeholder="e.g. 3 months"
            placeholderTextColor={colors.subtext}
          />

          <Text style={[styles.fieldLabel, { color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 8 }]}>WELLBEING AREAS</Text>
          {(Object.entries(subdomainsByDomain()) as [BpsDomain, typeof BPS_SUBDOMAINS[number][]][]).map(([domain, subs]) => (
            <View key={domain} style={{ marginBottom: 10 }}>
              <Text
                style={{
                  color: colors.subtext,
                  fontSize: getScaledFontSize(11),
                  textTransform: 'capitalize',
                  marginBottom: 4,
                }}
              >
                {domain}
              </Text>
              <View style={styles.chipRow}>
                {subs.map((s) => {
                  const active = subdomains.includes(s.key)
                  return (
                    <Pressable
                      key={s.key}
                      onPress={() => onToggleSubdomain(s.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={[
                        styles.pickerChip,
                        {
                          backgroundColor: active ? (colors.tint as string) + '22' : colors.background,
                          borderColor: active ? (colors.tint as string) : colors.border,
                          borderStyle: s.crossDomain ? 'dashed' : 'solid',
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: active ? (colors.tint as string) : colors.text,
                          fontSize: getScaledFontSize(12),
                          fontWeight: '600',
                        }}
                      >
                        {s.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable onPress={onClose} style={[styles.footerBtn, { borderColor: colors.border }]}>
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(14),
                fontWeight: getScaledFontWeight(600) as any,
              }}
            >
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={onSave}
            disabled={saving}
            style={[
              styles.footerBtn,
              {
                backgroundColor: colors.tint,
                borderColor: colors.tint,
                opacity: saving ? 0.7 : 1,
              },
            ]}
          >
            <Text
              style={{
                color: '#fff',
                fontSize: getScaledFontSize(14),
                fontWeight: getScaledFontWeight(700) as any,
              }}
            >
              Save
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

export function BioGoalEditorModal(props: BioGoalEditorModalProps): React.JSX.Element {
  const { visible, ...bodyProps } = props
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={bodyProps.onClose}>
      <BioGoalEditorBodyPresentation {...bodyProps} />
    </Modal>
  )
}


const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    padding: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  headerTitle: {},
  scrollArea: { marginBottom: Spacing.sm },
  fieldLabel: { marginTop: Spacing.sm, marginBottom: 4, letterSpacing: 0.6 },
  input: {
    borderWidth: 1,
    borderRadius: Radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  footer: { flexDirection: 'row', gap: 12, marginTop: Spacing.sm },
  footerBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pickerChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
})
