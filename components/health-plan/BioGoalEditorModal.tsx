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
 * Pressable, ScrollView, ActivityIndicator, MaterialIcons) — no new
 * native surface.
 */
import React from 'react'
import {
  ActivityIndicator,
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
  subdomainsByDomain,
  type BpsDomain,
} from '@/lib/bps-subdomains'

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

export function BioGoalEditorModal(props: BioGoalEditorModalProps): React.JSX.Element {
  const {
    visible,
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
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
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
            <Text
              style={[styles.fieldLabel, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}
            >
              TITLE
            </Text>
            <TextInput
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
              ]}
              value={title}
              onChangeText={onChangeTitle}
              maxLength={120}
              placeholder="Goal title"
              placeholderTextColor={colors.subtext}
            />

            <Text
              style={[styles.fieldLabel, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}
            >
              DESCRIPTION
            </Text>
            <TextInput
              style={[
                styles.input,
                styles.multiline,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
              ]}
              value={description}
              onChangeText={onChangeDescription}
              maxLength={300}
              multiline
              numberOfLines={3}
              placeholder="Description"
              placeholderTextColor={colors.subtext}
            />

            <Text
              style={[styles.fieldLabel, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}
            >
              TARGET
            </Text>
            <TextInput
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
              ]}
              value={target}
              onChangeText={onChangeTarget}
              maxLength={40}
              placeholder="Goal value"
              placeholderTextColor={colors.subtext}
            />

            <Text
              style={[styles.fieldLabel, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}
            >
              TIMEFRAME
            </Text>
            <TextInput
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
              ]}
              value={timeframe}
              onChangeText={onChangeTimeframe}
              maxLength={40}
              placeholder="e.g. 3 months"
              placeholderTextColor={colors.subtext}
            />

            <Text
              style={[
                styles.fieldLabel,
                { color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 8 },
              ]}
            >
              NOVOPSYCH SUBDOMAINS
            </Text>
            {(Object.entries(subdomainsByDomain()) as [BpsDomain, typeof BPS_SUBDOMAINS[number][]][])
              .map(([domain, subs]) => (
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
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text
                  style={{
                    color: '#fff',
                    fontSize: getScaledFontSize(14),
                    fontWeight: getScaledFontWeight(700) as any,
                  }}
                >
                  Save
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
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
