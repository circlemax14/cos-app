/**
 * Apple-style Time Zone picker with search.
 *
 * IANA TZ list is enumerated via Intl.supportedValuesOf('timeZone') —
 * available on iOS 14.5+ and Android (Hermes engine) ≥ 0.74. Falls
 * back to a curated list of common zones if the runtime can't provide
 * the full set, so we never render an empty picker.
 *
 * Filtered live by substring (case-insensitive) on the human-readable
 * label (e.g. "America/New York" → "new york").
 */

import React, { useMemo, useState } from 'react'
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { IconSymbol } from '@/components/ui/icon-symbol'

interface Props {
  visible: boolean
  selectedZone: string
  onSelect: (zone: string) => void
  onClose: () => void
}

const COMMON_FALLBACK = [
  'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Kolkata', 'Asia/Dubai',
  'Australia/Sydney', 'Pacific/Auckland', 'UTC',
]

function allZones(): string[] {
  try {
    // Intl.supportedValuesOf is iOS 14.5+ / Hermes 0.74+ — TS lib has it.
    const zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
      .supportedValuesOf?.('timeZone')
    if (zones && zones.length > 0) return zones
  } catch { /* fall through */ }
  return COMMON_FALLBACK
}

function humanize(z: string): string {
  return z.replace(/_/g, ' ')
}

export function TimeZonePicker({ visible, selectedZone, onSelect, onClose }: Props) {
  const { settings, getScaledFontSize } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const [query, setQuery] = useState('')
  const zones = useMemo(allZones, [])

  const filtered = useMemo(() => {
    if (!query.trim()) return zones
    const needle = query.trim().toLowerCase()
    return zones.filter((z) => z.toLowerCase().includes(needle))
  }, [query, zones])

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
          <Text style={{ color: colors.text, fontSize: getScaledFontSize(17), fontWeight: '700' }}>Time Zone</Text>
          <View style={styles.headerSide} />
        </View>

        <View style={[styles.searchRow, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <IconSymbol name="magnifyingglass" size={getScaledFontSize(15)} color={colors.subtext} />
          <TextInput
            style={[styles.searchInput, { color: colors.text, fontSize: getScaledFontSize(16) }]}
            placeholder="Search city or zone"
            placeholderTextColor={colors.subtext}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(z) => z}
          renderItem={({ item }) => {
            const isSelected = item === selectedZone
            return (
              <Pressable
                onPress={() => { onSelect(item); onClose() }}
                style={({ pressed }) => [
                  styles.row,
                  { borderBottomColor: colors.border, backgroundColor: pressed ? colors.cardBackground : 'transparent' },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
              >
                <Text
                  style={{
                    color: colors.text,
                    fontSize: getScaledFontSize(17),
                    fontWeight: isSelected ? '600' : '400',
                    flex: 1,
                  }}
                >
                  {humanize(item)}
                </Text>
                {isSelected && (
                  <Text style={{ color: colors.tint, fontSize: getScaledFontSize(18), fontWeight: '700' }}>✓</Text>
                )}
              </Pressable>
            )
          }}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
              No matches
            </Text>
          }
        />
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginVertical: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, paddingVertical: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  empty: { textAlign: 'center', paddingVertical: 40 },
})
