/**
 * COS-1274 — "About this test ✨", the app half of SCRUM-815.
 *
 * Ken approved: Health Trends lab sheet (open), Reports lab table and Health
 * Status labs-by-condition (collapsed). Everything here is GENERAL information
 * about the test — never a claim about this patient's result.
 *
 * Flag `lab_explanations_enabled` is read `=== true`, NOT via
 * useIsFeatureFlagEnabled (that defaults ON while loading / when absent).
 * Off → nothing renders. Collapsed → nothing is fetched: a report can have
 * dozens of rows, so each one asks only when opened.
 */
import React, { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useQuery } from '@tanstack/react-query'

import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { useFeatureFlags } from '@/hooks/use-feature-flags'
import { fetchLabExplanation } from '@/services/api/lab-explanation'

export interface AboutThisTestProps {
  name: string
  code?: string
  unit?: string
  /** The lab printed its own range — never show ours beside it. */
  labHasRange: boolean
  defaultExpanded?: boolean
}

const normUnit = (u?: string | null) => (u ?? '').replace(/\s+/g, '').toLowerCase()

// api-client rethrows HTTP failures as AxiosError and turns no-response
// failures into `code: 'NETWORK_ERROR'`.
const httpStatus = (e: unknown) => (e as { response?: { status?: number } } | null)?.response?.status
// Retry once only for what can clear on its own: 503 and the network. 400 (name
// rejected), 404 (flag off server-side) and 429 (rate limit) never.
const retryOnce = (failureCount: number, e: unknown) =>
  failureCount < 1 && (httpStatus(e) === 503 || (e as { code?: string } | null)?.code === 'NETWORK_ERROR')

export function AboutThisTest({ name, code, unit, labHasRange, defaultExpanded = false }: AboutThisTestProps) {
  const { data: flags } = useFeatureFlags()
  const [expanded, setExpanded] = useState(defaultExpanded)
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']

  // Report rows can arrive without a name (they render '—').
  const testName = (name ?? '').trim()
  // Apple Health metrics (hk-*) are not lab tests.
  const on =
    flags?.lab_explanations_enabled === true && testName !== '' && !(code ?? '').startsWith('hk-')

  const q = useQuery({
    queryKey: ['lab-explanation', testName.toLowerCase(), code ?? '', unit ?? ''],
    queryFn: () => fetchLabExplanation(testName, code, unit),
    enabled: on && expanded,
    staleTime: 24 * 60 * 60 * 1000,
    retry: retryOnce,
  })

  // 400 = the backend cannot use this name; 404 = FEATURE_DISABLED server-side.
  // Either way the whole block goes, header included — even if it was showing.
  const gone = q.isError && (httpStatus(q.error) === 400 || httpStatus(q.error) === 404)
  if (!on || gone) return null

  const fs = getScaledFontSize
  const quiet = (t: string) => (
    <Text style={{ color: colors.subtext, fontSize: fs(13), marginTop: 8 }}>{t}</Text>
  )
  const heading = (t: string) => (
    <Text
      accessibilityRole="header"
      style={{
        color: colors.text,
        fontSize: fs(13),
        fontWeight: getScaledFontWeight(600) as never,
        marginTop: 10,
      }}
    >
      {t}
    </Text>
  )
  // Line height scales with the font — see DrugLabelFacts for why.
  const body = (t: string) => (
    <Text style={{ color: colors.text, fontSize: fs(13), lineHeight: Math.round(fs(13) * 1.45), marginTop: 4 }}>
      {t}
    </Text>
  )

  const ex = q.data
  const typical = ex?.typicalRange
  // Ken Q4: ours only when the lab gave none AND the units agree.
  const showTypical = !labHasRange && !!typical && normUnit(unit) !== '' && normUnit(typical.unit) === normUnit(unit)

  return (
    // Open (detail sheet) = a card like TrendCard above it; inline in a list
    // row = no chrome, so a collapsed row only gains one tappable line.
    <View
      style={
        defaultExpanded
          ? [styles.card, { backgroundColor: (colors.card as string) + 'D9', borderColor: colors.border }]
          : undefined
      }
    >
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={({ pressed }) => [styles.head, { opacity: pressed ? 0.6 : 1 }]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`About this test, ${testName}. Written with AI`}
        hitSlop={8}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: fs(13), fontWeight: getScaledFontWeight(700) as never }}>
            About this test ✨
          </Text>
          <Text style={{ color: colors.subtext, fontSize: fs(11), marginTop: 1 }}>Written with AI</Text>
        </View>
        <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={fs(20)} color={colors.subtext} />
      </Pressable>

      {!expanded ? null : q.isLoading ? (
        <ActivityIndicator size="small" color={colors.tint as string} style={styles.spinner} />
      ) : q.isError ? (
        quiet("We couldn't load this right now.")
      ) : !ex ? (
        quiet("We don't have an explanation for this test yet.")
      ) : (
        <View>
          {heading('What it measures')}
          {body(ex.whatItMeasures)}
          {heading("Why it's done")}
          {body(ex.whyItsDone)}
          {heading("If it's higher than your lab's range")}
          {body(ex.ifHigher)}
          {heading("If it's lower than your lab's range")}
          {body(ex.ifLower)}
          {ex.goodToKnow ? (
            <>
              {heading('Good to know')}
              {body(ex.goodToKnow)}
            </>
          ) : null}
          {showTypical && typical ? (
            <>
              {body(`Typical range: ${typical.text} ${typical.unit}`)}
              <Text style={{ color: colors.subtext, fontSize: fs(11), marginTop: 2 }}>
                {"Typical range — your lab's may differ."}
              </Text>
            </>
          ) : null}
          <Text style={{ color: colors.subtext, fontSize: fs(11), lineHeight: Math.round(fs(11) * 1.45), marginTop: 10 }}>
            General information about this test, not about your result. Talk with your care team about your results.
          </Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  spinner: { alignSelf: 'flex-start', marginTop: 8 },
})
