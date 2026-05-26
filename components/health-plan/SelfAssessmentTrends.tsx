import React from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import {
  fetchAssessments,
  type AssessmentRecord,
  type BandSnapshot,
  type InstrumentId,
} from '@/services/api/assessments'

/**
 * SCRUM-268 Phase 3: compact "Self-Assessments" section on the Health
 * Trends screen. Shows the latest result for every check-in the user
 * has completed, with the descriptive band frozen at completion. Tap
 * an entry to see the full history (uses
 * /v1/patients/me/assessments/:instrumentId/history under the hood).
 *
 * Kept deliberately read-only and compact — full per-instrument charts
 * can land in a follow-up once Ken validates the layout.
 */

interface SelfAssessmentTrendsProps {
  onOpenInstrument?: (instrumentId: InstrumentId) => void
}

const FRIENDLY_NAME: Partial<Record<string, string>> = {
  'phq-2': 'Mood (PHQ-2)',
  'phq-9': 'Depression (PHQ-9)',
  'gad-7': 'Anxiety (GAD-7)',
  'pss-4': 'Stress (PSS-4)',
  'pain-4': 'Pain (PROMIS-4)',
  'sleep-4': 'Sleep',
  'wellbeing-5': 'Wellbeing',
  'alcohol-3': 'Alcohol use',
  'loneliness-3': 'Loneliness',
  'physical-function-4': 'Physical function',
  'falls-12': 'Falls risk',
  'nutrition-5': 'Nutrition',
  'cognition-8': 'Cognitive change',
  'adl': 'Daily living (ADL)',
  'iadl': 'Instrumental ADL',
  'mini-cog': 'Mini-Cog',
  'moca': 'MoCA',
  'full-intake': 'Full intake',
}

function bandColor(band: BandSnapshot | undefined, fallback: string): string {
  if (!band?.severity) return fallback
  switch (band.severity) {
    case 'high':     return '#DC2626'
    case 'moderate': return '#F59E0B'
    case 'low':      return '#10B981'
  }
}

function formatScore(record: AssessmentRecord): string {
  if (typeof record.scores?.total === 'number') return String(record.scores.total)
  if (typeof record.scores?.independent === 'number') return `${record.scores.independent}/${record.scores.total ?? '?'}`
  return '—'
}

function formatRelative(iso: string): string {
  const ms = Math.max(0, Date.now() - new Date(iso).getTime())
  const days = Math.floor(ms / 86400000)
  if (days < 1) return 'today'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

export function SelfAssessmentTrends({ onOpenInstrument }: SelfAssessmentTrendsProps): React.JSX.Element | null {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const fontSize = getScaledFontSize
  const fontWeight = getScaledFontWeight

  const query = useQuery({
    queryKey: ['assessments-trends'],
    queryFn: fetchAssessments,
    staleTime: 60 * 1000,
  })

  const records = (query.data ?? []).filter((r) => !!r.completedAt)
  records.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))

  if (query.isLoading) {
    return (
      <View style={[styles.loadingCard, { backgroundColor: (colors.card as string) + 'D9', borderColor: colors.border }]}>
        <ActivityIndicator color={colors.tint as string} />
        <Text style={{ color: colors.subtext, fontSize: fontSize(13), marginLeft: 12 }}>
          Loading self-assessments…
        </Text>
      </View>
    )
  }

  if (records.length === 0) {
    return (
      <View style={[styles.emptyCard, { borderColor: colors.border }]}>
        <MaterialIcons name="assignment" size={fontSize(28)} color={colors.subtext} />
        <Text style={{ color: colors.subtext, fontSize: fontSize(13), textAlign: 'center', marginTop: 8 }}>
          Take your first check-in to see results trend here.
        </Text>
      </View>
    )
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.carousel}
      decelerationRate="fast"
    >
      {records.map((record) => {
        const label = FRIENDLY_NAME[String(record.instrumentId)] ?? String(record.instrumentId)
        const bandTextColor = bandColor(record.band, colors.tint as string)
        const isOverdue = record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()
        return (
          <Pressable
            key={record.instrumentId}
            onPress={() => onOpenInstrument?.(record.instrumentId)}
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: (colors.card as string) + 'D9',
                borderColor: colors.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${label}, ${record.band?.label ?? 'completed'}, ${formatRelative(record.completedAt)}`}
          >
            <Text
              numberOfLines={2}
              style={{
                color: colors.text,
                fontSize: fontSize(13),
                fontWeight: fontWeight(700) as any,
                marginBottom: 6,
              }}
            >
              {label}
            </Text>
            <Text style={{ color: bandTextColor, fontSize: fontSize(22), fontWeight: fontWeight(700) as any }}>
              {formatScore(record)}
            </Text>
            {record.band?.label ? (
              <View style={[styles.bandPill, { borderColor: bandTextColor }]}>
                <View style={[styles.bandDot, { backgroundColor: bandTextColor }]} />
                <Text
                  style={{
                    color: bandTextColor,
                    fontSize: fontSize(10),
                    fontWeight: fontWeight(700) as any,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  {record.band.label}
                </Text>
              </View>
            ) : null}
            <Text style={{ color: colors.subtext, fontSize: fontSize(11), marginTop: 8 }}>
              {formatRelative(record.completedAt)}
              {isOverdue ? '  ·  Due' : ''}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  carousel: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 12,
  },
  card: {
    width: 156,
    minHeight: 130,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  bandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 6,
  },
  bandDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  emptyCard: {
    marginHorizontal: 16,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  loadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
})
