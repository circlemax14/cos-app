/**
 * Generic Apple-style selection picker for the event editor.
 *
 * Used by:
 *   - Repeat picker (Never / Daily / Weekly / Every 2 Weeks / Monthly /
 *     Yearly / Custom)
 *   - Travel Time picker (None / 5m / 15m / 30m / 1h / 1h 30m / 2h)
 *
 * Renders as a full-screen modal with a navigation-style header
 * ("Cancel" left, title centered, "Done" right). The list shows each
 * option with a leading checkmark on the currently-selected option.
 *
 * For pickers that need search / scroll-of-thousands (time zones), use
 * a dedicated component instead — this one is for short fixed lists.
 */

import React from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'

export interface SelectionOption<T extends string> {
  value: T
  label: string
  sublabel?: string
}

interface Props<T extends string> {
  visible: boolean
  title: string
  options: SelectionOption<T>[]
  selectedValue: T
  onSelect: (value: T) => void
  onClose: () => void
}

export function SelectionPicker<T extends string>({
  visible, title, options, selectedValue, onSelect, onClose,
}: Props<T>) {
  const { settings, getScaledFontSize } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} hitSlop={10} style={styles.headerSide}>
            <Text style={{ color: colors.tint, fontSize: getScaledFontSize(17) }}>Cancel</Text>
          </Pressable>
          <Text
            style={{ color: colors.text, fontSize: getScaledFontSize(17), fontWeight: '700', flexShrink: 1 }}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Pressable onPress={onClose} hitSlop={10} style={[styles.headerSide, { alignItems: 'flex-end' }]}>
            <Text style={{ color: colors.tint, fontSize: getScaledFontSize(17), fontWeight: '600' }}>Done</Text>
          </Pressable>
        </View>

        <View style={{ paddingVertical: 8 }}>
          {options.map((opt, i) => {
            const isSelected = opt.value === selectedValue
            return (
              <Pressable
                key={opt.value}
                onPress={() => { onSelect(opt.value); onClose() }}
                style={({ pressed }) => [
                  styles.row,
                  i < options.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  },
                  { backgroundColor: pressed ? colors.cardBackground : 'transparent' },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={opt.label}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: getScaledFontSize(17), fontWeight: isSelected ? '600' : '400' }}>
                    {opt.label}
                  </Text>
                  {opt.sublabel && (
                    <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 2 }}>
                      {opt.sublabel}
                    </Text>
                  )}
                </View>
                {isSelected && (
                  <Text style={{ color: colors.tint, fontSize: getScaledFontSize(18), fontWeight: '700' }}>✓</Text>
                )}
              </Pressable>
            )
          })}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
  },
  headerSide: { flex: 1, paddingVertical: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
})
