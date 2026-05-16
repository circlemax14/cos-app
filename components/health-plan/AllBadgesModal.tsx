import React from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Card } from 'react-native-paper'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useQuery } from '@tanstack/react-query'
import { fetchBadgeProgress, type BadgeCategory, type BadgeTier } from '@/services/api/badges'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'

const TIER_COLORS: Record<BadgeTier, string> = {
  bronze: '#CD7F32',
  silver: '#C0C0C0',
  gold: '#FFD700',
}

const CATEGORY_LABEL: Record<BadgeCategory, string> = {
  streak: 'Streaks',
  adherence: 'Adherence',
  'per-task-type': 'Activities',
  awareness: 'Awareness days',
}

interface AllBadgesModalProps {
  visible: boolean
  onClose: () => void
}

/**
 * Full badge gallery — earned + locked, grouped by category. Locked badges
 * show grayed-out medallion with a "next at <threshold> <unit>" progress line.
 */
export function AllBadgesModal({ visible, onClose }: AllBadgesModalProps): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const query = useQuery({
    queryKey: ['badge-progress'],
    queryFn: fetchBadgeProgress,
    enabled: visible,
  })

  const grouped = React.useMemo(() => {
    const out: Record<BadgeCategory, { earned: NonNullable<typeof query.data>['earned']; locked: NonNullable<typeof query.data>['locked'] }> =
      {
        streak:         { earned: [], locked: [] },
        adherence:      { earned: [], locked: [] },
        'per-task-type': { earned: [], locked: [] },
        awareness:      { earned: [], locked: [] },
      }
    if (!query.data) return out
    for (const b of query.data.earned) out[b.category].earned.push(b)
    for (const b of query.data.locked) out[b.category].locked.push(b)
    return out
  }, [query.data])

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(22),
              fontWeight: getScaledFontWeight(700) as any,
              flex: 1,
            }}
          >
            All badges
          </Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <MaterialIcons name="close" size={getScaledFontSize(26)} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          {(Object.keys(grouped) as BadgeCategory[]).map((category) => {
            const { earned, locked } = grouped[category]
            if (earned.length === 0 && locked.length === 0) return null
            return (
              <View key={category} style={styles.section}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: getScaledFontSize(15),
                    fontWeight: getScaledFontWeight(700) as any,
                    marginBottom: 8,
                  }}
                >
                  {CATEGORY_LABEL[category]}
                </Text>
                <View style={styles.grid}>
                  {earned.map((b) => (
                    <Card key={`e-${b.id}-${b.tier}`} style={[styles.tile, { backgroundColor: colors.card }]}>
                      <View style={[styles.medallion, { backgroundColor: TIER_COLORS[b.tier] }]}>
                        <Text style={styles.medallionInitial}>{b.name.slice(0, 1).toUpperCase()}</Text>
                      </View>
                      <Text
                        numberOfLines={2}
                        style={{
                          color: colors.text,
                          fontSize: getScaledFontSize(12),
                          fontWeight: getScaledFontWeight(600) as any,
                          textAlign: 'center',
                          marginTop: 8,
                        }}
                      >
                        {b.name}
                      </Text>
                      <Text
                        style={{
                          color: TIER_COLORS[b.tier],
                          fontSize: getScaledFontSize(10),
                          fontWeight: getScaledFontWeight(700) as any,
                          textTransform: 'uppercase',
                          marginTop: 2,
                          letterSpacing: 0.5,
                        }}
                      >
                        {b.tier}
                      </Text>
                      {b.nextThreshold ? (
                        <Text
                          style={{
                            color: colors.subtext,
                            fontSize: getScaledFontSize(10),
                            textAlign: 'center',
                            marginTop: 2,
                          }}
                        >
                          {b.progress} / {b.nextThreshold} for {b.nextTier}
                        </Text>
                      ) : null}
                    </Card>
                  ))}
                  {locked.map((b) => (
                    <Card key={`l-${b.id}`} style={[styles.tile, { backgroundColor: colors.card, opacity: 0.55 }]}>
                      <View style={[styles.medallion, styles.medallionLocked]}>
                        <MaterialIcons name="lock-outline" size={28} color="#666" />
                      </View>
                      <Text
                        numberOfLines={2}
                        style={{
                          color: colors.text,
                          fontSize: getScaledFontSize(12),
                          fontWeight: getScaledFontWeight(600) as any,
                          textAlign: 'center',
                          marginTop: 8,
                        }}
                      >
                        {b.name}
                      </Text>
                      <Text
                        style={{
                          color: colors.subtext,
                          fontSize: getScaledFontSize(10),
                          textAlign: 'center',
                          marginTop: 2,
                        }}
                      >
                        {b.progress} / {b.nextThreshold}
                      </Text>
                    </Card>
                  ))}
                </View>
              </View>
            )
          })}
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  section: { marginBottom: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '31%',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  medallion: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medallionLocked: { backgroundColor: '#33333344' },
  medallionInitial: { color: '#fff', fontSize: 22, fontWeight: '800' },
})
