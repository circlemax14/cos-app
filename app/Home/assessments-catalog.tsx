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
import { useQuery } from '@tanstack/react-query'
import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { fetchInstruments, type InstrumentSummary } from '@/services/api/instruments'
import { usePlanType, meetsTier } from '@/hooks/use-plan-type'

// Existing hardcoded intake flow handles these instrumentIds. Everything
// else surfaces a "coming soon" stub until the dynamic renderer ships
// (next SCRUM-215 sub-story).
const HARDCODED_INTAKE_IDS = new Set([
  'phq-2',
  'phq-9',
  'gad-7',
  'adl',
  'iadl',
  'wellbeing',
  'lifestyle',
  'goals',
])

export default function AssessmentsCatalogScreen(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']

  const { planType, isLoading: planLoading } = usePlanType()
  const canAccess = meetsTier(planType, 'advanced')

  const instrumentsQuery = useQuery({
    queryKey: ['instruments-catalog'],
    queryFn: fetchInstruments,
    enabled: canAccess,
    staleTime: 5 * 60 * 1000,
  })

  if (planLoading || (canAccess && instrumentsQuery.isLoading)) {
    return (
      <AppWrapper>
        <View style={[styles.centerWrap, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.tint as string} />
        </View>
      </AppWrapper>
    )
  }

  if (!canAccess) {
    return (
      <AppWrapper>
        <View style={[styles.centerWrap, { backgroundColor: colors.background }]}>
          <MaterialIcons name="lock-outline" size={getScaledFontSize(56)} color={colors.tint as string} />
          <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(700) as any }]}>
            Health check-ins are an Advanced feature
          </Text>
          <Text style={[styles.body, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
            Upgrade to access the full set of guided assessments.
          </Text>
          <Pressable
            onPress={() => router.replace('/Home/health-plan' as never)}
            style={[styles.primaryBtn, { backgroundColor: colors.tint as string }]}
            accessibilityRole="button"
          >
            <Text style={[styles.primaryBtnText, { fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(700) as any }]}>
              View plans
            </Text>
          </Pressable>
        </View>
      </AppWrapper>
    )
  }

  const items = instrumentsQuery.data ?? []

  return (
    <AppWrapper>
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
            <MaterialIcons name="arrow-back" size={getScaledFontSize(24)} color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text, fontSize: getScaledFontSize(22), fontWeight: getScaledFontWeight(700) as any, marginLeft: 12 }]}>
            Available check-ins
          </Text>
        </View>

        <Text style={[styles.subhead, { color: colors.subtext, fontSize: getScaledFontSize(13) }]}>
          These are the assessments available on your plan. Tap one to begin.
        </Text>

        {items.length === 0 ? (
          <View style={[styles.emptyWrap, { borderColor: colors.border }]}>
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), textAlign: 'center' }}>
              No assessments are available right now. Check back later.
            </Text>
          </View>
        ) : (
          items.map((it) => (
            <CatalogRow
              key={it.id}
              item={it}
              colors={colors}
              fontSize={getScaledFontSize}
              fontWeight={getScaledFontWeight}
            />
          ))
        )}
      </ScrollView>
    </AppWrapper>
  )
}

type Palette = typeof Colors['light'] | typeof Colors['dark']

function CatalogRow({
  item,
  colors,
  fontSize,
  fontWeight,
}: {
  item: InstrumentSummary
  colors: Palette
  fontSize: (n: number) => number
  fontWeight: (n: number) => number | string
}) {
  const supported = HARDCODED_INTAKE_IDS.has(item.instrumentId)
  const ownerLabel = item.ownerType === 'system' ? 'System' : 'Your agency'

  const onPress = () => {
    if (!supported) return
    router.push('/Home/assessment-intake' as never)
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Start ${item.name}`}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed && supported ? 0.85 : 1,
        },
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.rowHeader}>
          <Text
            style={{
              color: colors.text,
              fontSize: fontSize(16),
              fontWeight: fontWeight(700) as any,
              flexShrink: 1,
            }}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          <Text
            style={[
              styles.ownerBadge,
              {
                color: colors.subtext,
                borderColor: colors.border,
                fontSize: fontSize(10),
                fontWeight: fontWeight(600) as any,
              },
            ]}
          >
            {ownerLabel}
          </Text>
        </View>

        <Text
          numberOfLines={2}
          style={{
            color: colors.subtext,
            fontSize: fontSize(13),
            marginTop: 4,
          }}
        >
          {item.description}
        </Text>

        <Text
          style={{
            color: colors.subtext,
            fontSize: fontSize(11),
            marginTop: 6,
          }}
        >
          Re-take every {item.expiryDays} {item.expiryDays === 1 ? 'day' : 'days'}
        </Text>

        {!supported && (
          <View style={[styles.comingSoon, { backgroundColor: (colors.tint as string) + '14' }]}>
            <Text style={{ color: colors.tint as string, fontSize: fontSize(11), fontWeight: fontWeight(600) as any }}>
              Coming soon
            </Text>
          </View>
        )}
      </View>

      {supported ? (
        <MaterialIcons name="chevron-right" size={fontSize(22)} color={colors.subtext} />
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
  headerTitle: { flex: 1 },
  subhead: { paddingHorizontal: 4, marginBottom: 12 },
  title: { marginTop: 12, textAlign: 'center' },
  body: { marginTop: 6, paddingHorizontal: 8, textAlign: 'center' },
  primaryBtn: { marginTop: 18, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999 },
  primaryBtnText: { color: '#fff' },
  emptyWrap: { borderWidth: 1, borderRadius: 12, padding: 24, marginTop: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ownerBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  comingSoon: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
})
