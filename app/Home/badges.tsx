import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Card } from 'react-native-paper'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import {
  fetchBadgeProgress,
  fetchBadgeCatalog,
  type BadgeCategory,
  type BadgeTier,
  type EarnedBadge,
  type LockedBadge,
  type BadgeDefinition,
} from '@/services/api/badges'
import { useBadgeCelebrations } from '@/components/celebrations/BadgeCelebrationProvider'
import { useCanRender } from '@/hooks/use-entitlement'

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

const TIER_COLORS: Record<BadgeTier, string> = {
  bronze: '#CD7F32',
  silver: '#C0C0C0',
  gold: '#FFD700',
}

const CATEGORY_LABEL: Record<BadgeCategory, string> = {
  streak: 'Streaks',
  adherence: 'Adherence',
  'per-task-type': 'Activities',
  awareness: 'Awareness',
}

/**
 * Dedicated Badges screen — accessible from the side menu drawer.
 *
 * - Locked badges are grey (greyed-out medallion + label)
 * - Earned badges take their tier color (bronze/silver/gold)
 * - Tap an earned badge to replay the Apple-Health-style celebration
 * - Tap a locked badge to see what's required + current progress
 *
 * Stakeholder feedback (2026-05-18): "I want badges to be a separate screen
 * which will be accessible from left menu, in this we will have all badges
 * in greyed out form and when someone achieves any badges then it will take
 * same color as of app and when user clicks on it, it will open with
 * animation similar to Apple Health."
 */
export default function BadgesScreen(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const { enqueue } = useBadgeCelebrations()
  // Entitlement gates — hooks, so unconditional and at the top.
  const canView = useCanRender('badges.view')
  const canViewBadgeDetail = useCanRender('badges.view-badge-detail')
  const canViewEarnedBadges = useCanRender('badges.view-earned-badges')
  const [selectedLocked, setSelectedLocked] = React.useState<LockedBadge | null>(null)

  const progressQuery = useQuery({
    queryKey: ['badge-progress'],
    queryFn: fetchBadgeProgress,
  })
  const catalogQuery = useQuery({
    queryKey: ['badge-catalog'],
    queryFn: fetchBadgeCatalog,
  })

  // Merge: every catalog badge gets either an earned or locked record
  const grouped = React.useMemo(() => {
    const earnedMap = new Map<string, EarnedBadge>()
    const lockedMap = new Map<string, LockedBadge>()
    for (const b of progressQuery.data?.earned ?? []) earnedMap.set(b.id, b)
    for (const b of progressQuery.data?.locked ?? []) lockedMap.set(b.id, b)

    const out: Record<BadgeCategory, { earned: EarnedBadge[]; locked: LockedBadge[]; defs: BadgeDefinition[] }> = {
      streak:          { earned: [], locked: [], defs: [] },
      adherence:       { earned: [], locked: [], defs: [] },
      'per-task-type': { earned: [], locked: [], defs: [] },
      awareness:       { earned: [], locked: [], defs: [] },
    }
    for (const def of catalogQuery.data ?? []) {
      out[def.category].defs.push(def)
      const earned = earnedMap.get(def.id)
      if (earned) out[def.category].earned.push(earned)
      const locked = lockedMap.get(def.id)
      if (locked) out[def.category].locked.push(locked)
    }
    return out
  }, [progressQuery.data, catalogQuery.data])

  const replayCelebration = React.useCallback((b: EarnedBadge) => {
    enqueue([b])
  }, [enqueue])

  return (
    <AppWrapper>
      {canView && <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
            <MaterialIcons name="arrow-back" size={getScaledFontSize(24)} color={colors.text} />
          </Pressable>
          <Text style={{
            color: colors.text,
            fontSize: getScaledFontSize(22),
            fontWeight: getScaledFontWeight(700) as any,
            marginLeft: 12,
            flex: 1,
          }}>Badges</Text>
        </View>

        <Text style={{
          color: colors.subtext,
          fontSize: getScaledFontSize(13),
          paddingHorizontal: 16,
          marginBottom: 16,
        }}>
          Earn badges by completing your daily plan. Tap an earned badge to celebrate it again.
        </Text>

        {progressQuery.isLoading || catalogQuery.isLoading ? (
          <Text style={{ color: colors.subtext, padding: 24, textAlign: 'center' }}>Loading…</Text>
        ) : (Object.keys(grouped) as BadgeCategory[]).map((category) => {
          const { defs } = grouped[category]
          if (defs.length === 0) return null
          return (
            <View key={category} style={styles.section}>
              <Text style={{
                color: colors.text,
                fontSize: getScaledFontSize(15),
                fontWeight: getScaledFontWeight(700) as any,
                marginLeft: 16,
                marginBottom: 8,
              }}>{CATEGORY_LABEL[category]}</Text>
              <View style={styles.grid}>
                {defs.map((def) => {
                  const earned = grouped[category].earned.find((e) => e.id === def.id)
                  const locked = grouped[category].locked.find((l) => l.id === def.id)
                  // The earned tile IS the earned-badge control: its own
                  // a11y label and the celebration replay hang off `earned`.
                  // Locked tiles are unaffected — nothing is stranded, this
                  // screen is read-only.
                  return (!earned || canViewEarnedBadges) && (
                    <BadgeTile
                      key={def.id}
                      def={def}
                      earned={earned}
                      locked={locked}
                      colors={colors}
                      getScaledFontSize={getScaledFontSize}
                      getScaledFontWeight={getScaledFontWeight}
                      onPressEarned={replayCelebration}
                      onPressLocked={setSelectedLocked}
                    />
                  )
                })}
              </View>
            </View>
          )
        })}
      </ScrollView>}

      {canViewBadgeDetail && selectedLocked ? (
        <LockedDetailSheet
          badge={selectedLocked}
          catalog={catalogQuery.data ?? []}
          onClose={() => setSelectedLocked(null)}
        />
      ) : null}
    </AppWrapper>
  )
}

function BadgeTile({
  def,
  earned,
  locked,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  onPressEarned,
  onPressLocked,
}: {
  def: BadgeDefinition
  earned?: EarnedBadge
  locked?: LockedBadge
  colors: { text: string; subtext: string; card: string }
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
  onPressEarned: (b: EarnedBadge) => void
  onPressLocked: (b: LockedBadge) => void
}): React.JSX.Element {
  const isEarned = !!earned
  const tierColor = earned ? TIER_COLORS[earned.tier] : '#3f3f3f55'

  return (
    <Pressable
      onPress={() => {
        if (earned) onPressEarned(earned)
        else if (locked) onPressLocked(locked)
      }}
      style={styles.tile}
      accessibilityRole="button"
      accessibilityLabel={isEarned ? `${def.name}, ${earned!.tier} tier earned. Tap to celebrate.` : `${def.name} locked. Tap to see how to earn.`}
    >
      <Card style={[styles.tileCard, { backgroundColor: colors.card, opacity: isEarned ? 1 : 0.65 }]}>
        <Card.Content style={{ alignItems: 'center' }}>
          <View style={[styles.medallion, { backgroundColor: tierColor }]}>
            {isEarned ? (
              <Text style={styles.medallionInitial}>{def.name.slice(0, 1).toUpperCase()}</Text>
            ) : (
              <MaterialIcons name="lock-outline" size={28} color="#666" />
            )}
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
            {def.name}
          </Text>
          <Text
            style={{
              marginTop: 2,
              fontSize: getScaledFontSize(10),
              color: isEarned ? tierColor : colors.subtext,
              fontWeight: getScaledFontWeight(700) as any,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {isEarned ? earned!.tier : 'locked'}
          </Text>
          {locked && !isEarned ? (
            <Text style={{ marginTop: 2, fontSize: getScaledFontSize(10), color: colors.subtext, textAlign: 'center' }}>
              {locked.progress} / {locked.nextThreshold}
            </Text>
          ) : null}
        </Card.Content>
      </Card>
    </Pressable>
  )
}

function LockedDetailSheet({
  badge,
  catalog,
  onClose,
}: {
  badge: LockedBadge
  catalog: BadgeDefinition[]
  onClose: () => void
}): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const def = catalog.find((d) => d.id === badge.id)
  const pct = badge.nextThreshold > 0 ? Math.round((badge.progress / badge.nextThreshold) * 100) : 0
  return (
    <Pressable
      onPress={onClose}
      style={{
        position: 'absolute', inset: 0, zIndex: 100,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'flex-end',
      }}
      accessibilityRole="button"
      accessibilityLabel="Close locked-badge details"
    >
      <Pressable
        onPress={(e) => e.stopPropagation()}
        style={{
          backgroundColor: colors.card,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: 24,
          paddingBottom: 36,
        }}
      >
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          <View style={[styles.medallion, { backgroundColor: '#3f3f3f55', width: 72, height: 72, borderRadius: 36 }]}>
            <MaterialIcons name="lock-outline" size={36} color="#666" />
          </View>
        </View>
        <Text style={{ color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(700) as any, textAlign: 'center' }}>
          {badge.name}
        </Text>
        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginTop: 8, textAlign: 'center', lineHeight: getScaledFontSize(20) }}>
          {def?.description ?? badge.name}
        </Text>
        <Text style={{ marginTop: 16, color: colors.text, fontSize: getScaledFontSize(14), textAlign: 'center', fontWeight: getScaledFontWeight(600) as any }}>
          Progress: {badge.progress} / {badge.nextThreshold} {def?.unit ?? ''} · {pct}%
        </Text>
        <View style={{
          marginTop: 10,
          height: 6,
          borderRadius: 3,
          backgroundColor: colors.subtext + '30',
          overflow: 'hidden',
        }}>
          <View style={{ width: `${Math.min(100, pct)}%`, height: '100%', backgroundColor: TIER_COLORS[badge.nextTier] }} />
        </View>
      </Pressable>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 12 },
  section: { marginBottom: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8 },
  tile: { width: '31%' },
  tileCard: { borderRadius: 12 },
  medallion: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medallionInitial: { color: '#fff', fontSize: 22, fontWeight: '800' },
})
