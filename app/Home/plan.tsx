import React, { useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useHealthPlan, useRefreshAiInsights } from '@/hooks/use-health-plan'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'

export default function PlanScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']

  const { data, isLoading, isError, refetch } = useHealthPlan()
  const refresh = useRefreshAiInsights()
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const handleRefresh = () => {
    setRefreshError(null)
    refresh.mutate(undefined, {
      onError: (err: unknown) => {
        // Surface the nextRefreshAvailableAt timestamp when the backend returns 429
        const anyErr = err as { response?: { status?: number; data?: { data?: { nextRefreshAvailableAt?: string } } } }
        if (anyErr?.response?.status === 429) {
          const next = anyErr.response?.data?.data?.nextRefreshAvailableAt
          setRefreshError(
            `Too many requests. Next refresh available at ${next ? new Date(next).toLocaleTimeString() : 'a later time'}.`
          )
        } else {
          setRefreshError('Failed to refresh AI insights. Please try again.')
        }
      },
    })
  }

  if (isLoading)
    return <ActivityIndicator style={[styles.center, { backgroundColor: colors.background }]} color={colors.tint} />

  if (isError)
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.text, fontSize: getScaledFontSize(16) }]}>
          Failed to load health plan
        </Text>
        <TouchableOpacity onPress={() => refetch()}>
          <Text style={[styles.retry, { color: colors.tint, fontSize: getScaledFontSize(16) }]}>Retry</Text>
        </TouchableOpacity>
      </View>
    )

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Care Manager Plan */}
      {data?.careManagerPlan && (
        <View style={styles.section}>
          <Text
            style={[
              styles.sectionTitle,
              { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as any },
            ]}
          >
            Care Manager Plan
          </Text>
          {data.careManagerPlan.goals.map((goal) => (
            <View key={goal.id} style={[styles.goal, { backgroundColor: colors.cardBackground }]}>
              <Text
                style={[
                  styles.goalTitle,
                  { color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(600) as any },
                ]}
              >
                {goal.title}
              </Text>
              <Text style={[styles.goalDesc, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
                {goal.description}
              </Text>
              <Text
                style={[
                  styles.goalStatus,
                  { fontSize: getScaledFontSize(12) },
                  goal.status === 'active' && styles.status_active,
                  goal.status === 'completed' && styles.status_completed,
                  goal.status === 'cancelled' && styles.status_cancelled,
                ]}
              >
                {goal.status}
              </Text>
            </View>
          ))}
          {data.careManagerPlan.notes ? (
            <Text style={[styles.notes, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
              {data.careManagerPlan.notes}
            </Text>
          ) : null}
        </View>
      )}

      {/* AI Health Insights */}
      {data?.aiInsights && (
        <View style={styles.section}>
          <Text
            style={[
              styles.sectionTitle,
              { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as any },
            ]}
          >
            AI Health Insights
          </Text>
          <Text style={[styles.summary, { color: colors.text, fontSize: getScaledFontSize(16) }]}>
            {data.aiInsights.summary}
          </Text>
          {data.aiInsights.recommendations.map((rec, i) => (
            <View key={i} style={[styles.rec, { backgroundColor: colors.cardBackground }]}>
              <Text
                style={[
                  styles.recCategory,
                  { color: colors.tint, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(600) as any },
                ]}
              >
                {rec.category}
              </Text>
              <Text style={[{ color: colors.text, fontSize: getScaledFontSize(14) }]}>{rec.text}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Refresh AI Insights button */}
      <TouchableOpacity
        style={[styles.refreshBtn, refresh.isPending && styles.refreshBtnDisabled]}
        onPress={handleRefresh}
        disabled={refresh.isPending}
        activeOpacity={0.8}
      >
        <Text style={[styles.refreshBtnText, { fontSize: getScaledFontSize(16) }]}>
          {refresh.isPending ? 'Refreshing...' : 'Refresh AI Insights'}
        </Text>
      </TouchableOpacity>

      {refreshError ? (
        <Text style={[styles.refreshErrorText, { fontSize: getScaledFontSize(13) }]}>{refreshError}</Text>
      ) : null}

      {!data?.careManagerPlan && !data?.aiInsights && (
        <View style={styles.center}>
          <Text style={[{ color: colors.text, fontSize: getScaledFontSize(16) }]}>
            No health plan available yet.
          </Text>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 60, flexGrow: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorText: { textAlign: 'center' },
  retry: { marginTop: 8 },
  section: { marginBottom: 24 },
  sectionTitle: { marginBottom: 12 },
  goal: { padding: 12, borderRadius: 8, marginBottom: 8 },
  goalTitle: {},
  goalDesc: { marginTop: 4, color: '#555' },
  goalStatus: { marginTop: 4, fontWeight: '500', textTransform: 'capitalize' },
  status_active: { color: '#34C759' },
  status_completed: { color: '#8E8E93' },
  status_cancelled: { color: '#FF3B30' },
  notes: { marginTop: 8, fontStyle: 'italic' },
  summary: { lineHeight: 22, marginBottom: 12 },
  rec: { padding: 10, borderRadius: 8, marginBottom: 6 },
  recCategory: { marginBottom: 2 },
  refreshBtn: {
    backgroundColor: '#007AFF',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginVertical: 16,
  },
  refreshBtnDisabled: { backgroundColor: '#A0A0A0' },
  refreshBtnText: { color: '#fff', fontWeight: '600' },
  refreshErrorText: { color: '#FF3B30', textAlign: 'center', marginBottom: 8 },
} as const)
