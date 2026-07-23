import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import {
  fetchAssessmentHistory,
  fetchAssessments,
  type AssessmentRecord,
  type BandSnapshot,
  type InstrumentId,
} from '@/services/api/assessments'
import {
  computeBand,
  computeTrend,
  extractScore,
  getBandDef,
  type AssessmentBandDef,
  type AssessmentBandResult,
  type BandTone,
  type TrendResult,
} from '@/lib/assessment-bands'

/**
 * SCRUM-268 Phase 3: compact "Self-Assessments" section on the Health
 * Trends screen. Shows the latest result for every check-in the user
 * has completed. Tap an entry to see the full history (uses
 * /v1/patients/me/assessments/:instrumentId/history under the hood).
 *
 * Chunk 58 (Ken 2026-07-22 dogfood): switched the pill from raw numeric
 * score ("ADL-6", "Instrumental ADL-8") to patient-friendly
 * High/Medium/Low bands with a trend arrow. Raw score preserved below
 * for clinicians. Flag-gated by SELF_ASSESSMENTS_HUMAN_LABELS_ENABLED —
 * flip false to restore the pre-chunk-58 numeric-only card without a
 * binary cut.
 *
 * Also shared with the BPS plan screen (chunk 57); both surfaces
 * benefit from the same refactor.
 */

interface SelfAssessmentTrendsProps {
  onOpenInstrument?: (instrumentId: InstrumentId) => void
}

/**
 * Chunk 58 kill-switch. Set to false to revert to the pre-chunk-58
 * numeric-only card (raw score front-and-center, no High/Med/Low pill,
 * no trend arrow). Layout-shift-neutral either way.
 */
const SELF_ASSESSMENTS_HUMAN_LABELS_ENABLED = true

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

const TONE_COLORS: Record<BandTone, string> = {
  good: '#10B981',
  warn: '#F59E0B',
  bad: '#DC2626',
  neutral: '#6B7280',
}

function legacyBandColor(band: BandSnapshot | undefined, fallback: string): string {
  if (!band?.severity) return fallback
  switch (band.severity) {
    case 'high':     return '#DC2626'
    case 'moderate': return '#F59E0B'
    case 'low':      return '#10B981'
  }
}

/**
 * Format the raw score caption Ken asked to preserve for clinicians.
 * Uses the SAME field the band computation used (via def.scoreField) so
 * the pill and the caption are always on the same metric.
 *
 * Chunk 58 adversarial-verify fix (round 2): no silent fallback to
 * scores.total. If extractScore returned undefined for the def's
 * chosen field, we render "—" — otherwise the caption would print a
 * number on a semantically-different scale than the pill implies
 * (Katz total masquerading as an ADL independent count, etc.).
 */
function formatScore(scoreValue: number | undefined): string {
  if (typeof scoreValue === 'number' && Number.isFinite(scoreValue)) {
    return String(scoreValue)
  }
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

function trendIconName(direction: TrendResult['direction']): 'trending-up' | 'trending-down' | 'trending-flat' {
  if (direction === 'up') return 'trending-up'
  if (direction === 'down') return 'trending-down'
  return 'trending-flat'
}

/**
 * CHUNK 93 (2026-07-23): direction-of-goodness phrasing for VoiceOver.
 * A user hearing "Depression: Low" doesn't know whether Low is better or
 * worse without context. We translate the current band into a plain-
 * language health interpretation using the instrument's direction-of-
 * goodness (pulled from ASSESSMENT_BANDS via getBandDef). The tone
 * already encodes band-level × direction (green = healthy regardless
 * of whether high or low is better), so we lean on it rather than
 * re-deriving the mapping and risking drift from computeBand.
 */
function bandDirectionPhrasing(
  def: AssessmentBandDef | undefined,
  band: AssessmentBandResult | undefined,
): string | undefined {
  if (!def || !band) return undefined
  switch (band.tone) {
    case 'good': return 'healthy'
    case 'warn': return 'attention needed'
    case 'bad':  return 'concerning'
    case 'neutral': return undefined
  }
}

/**
 * CHUNK 93: describe the visual trend arrow that's already rendered.
 * Reads the ARROW direction (up/down/flat), NOT the semantic tone —
 * chunk 58's existing accessibilityLabel already announces the meaning
 * ("improving"/"worsening"), and pairing that with a visual descriptor
 * would be redundant. Here we describe what the pill+arrow region
 * looks like, and the direction-of-goodness clause carries the meaning.
 */
function trendArrowPhrasing(direction: TrendResult['direction'] | undefined): string | undefined {
  if (!direction) return undefined
  if (direction === 'up') return 'trending upward'
  if (direction === 'down') return 'trending downward'
  return 'no change'
}

export function SelfAssessmentTrends({ onOpenInstrument }: SelfAssessmentTrendsProps): React.JSX.Element | null {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const fontSize = getScaledFontSize
  const fontWeight = getScaledFontWeight
  const router = useRouter()

  const query = useQuery({
    queryKey: ['assessments-trends'],
    queryFn: fetchAssessments,
    staleTime: 60 * 1000,
  })

  const records = (query.data ?? []).filter((r) => !!r.completedAt)
  records.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))

  // Chunk 58: batch-fetch per-instrument history so we can render the
  // trend arrow Ken asked for ("my fall risk was really high when I
  // started, now it's low"). Cheap: one small GET per visible card,
  // 5-minute stale window, and only when the human-labels view is on.
  //
  // Chunk 58 adversarial-verify fix (indexing race): the render below
  // looks up history BY instrumentId via historyById, NOT by array
  // index. records.sort runs each render; if useQueries + records
  // fall out of sync mid-refetch, an index lookup would misalign the
  // trend to a different assessment. By-id lookup stays correct.
  const historyQueries = useQueries({
    queries: SELF_ASSESSMENTS_HUMAN_LABELS_ENABLED
      ? records.map((r) => ({
          queryKey: ['assessment-history', r.instrumentId] as const,
          queryFn: () => fetchAssessmentHistory(r.instrumentId),
          staleTime: 5 * 60 * 1000,
          enabled: !!r.instrumentId,
        }))
      : [],
  })
  const historyById = React.useMemo(() => {
    const map = new Map<string, AssessmentRecord[]>()
    records.forEach((r, i) => {
      const data = historyQueries[i]?.data ?? []
      // Explicit newest-first sort — do NOT trust the API to return in
      // any particular order. Chunk 58 adversarial-verify blocker fix:
      // if the API happened to return oldest-first, history[1] would
      // be the second-oldest, and trend would report an improving
      // patient as "worsening" (and vice versa).
      const sorted = [...data]
        .filter((rec) => !!rec?.completedAt)
        .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
      map.set(String(r.instrumentId), sorted)
    })
    return map
  }, [records, historyQueries])

  if (query.isLoading) {
    return (
      <View style={[styles.loadingCard, { backgroundColor: (colors.card as string) + 'D9', borderColor: colors.border }]}>
        <Text style={{ color: colors.subtext, fontSize: fontSize(13), marginLeft: 0 }}>
          Loading self-assessments…
        </Text>
      </View>
    )
  }

  if (records.length === 0) {
    // CHUNK 79 (2026-07-23): warmer empty state that mirrors the chunk-74
    // wellbeing empty pattern — same MaterialIcons "self-improvement"
    // glyph in muted subtext color, same "Complete your first check-in
    // to see your progress over time" voice, plus a tappable CTA that
    // routes to the assessments catalog with a distinct analytics source
    // so downstream funnel analysis can attribute conversions to this
    // specific empty state (vs banner / wellbeing-empty-pill / etc).
    //
    // minHeight preserves layout so empty ↔ populated doesn't CLS: the
    // populated ScrollView carousel renders cards of minHeight 130 +
    // 4 paddingTop + 8 paddingBottom = ~142pt. Matching that here keeps
    // the surrounding Health Trends screen jitter-free on cold mount
    // and again the moment the user completes their first check-in.
    return (
      <View style={[styles.emptyCard, { borderColor: colors.border }]}>
        <MaterialIcons name="self-improvement" size={fontSize(32)} color={colors.subtext} />
        <Text style={{ color: colors.subtext, fontSize: fontSize(13), textAlign: 'center', marginTop: 10 }}>
          Complete your first check-in to see your progress over time.
        </Text>
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/Home/assessments-catalog',
              params: { source: 'self-assessments-empty' },
            } as never)
          }
          hitSlop={12}
          style={({ pressed }) => ({
            marginTop: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            minHeight: 44,
            minWidth: 44,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
          accessibilityRole="button"
          accessibilityLabel="Take a check-in for self-assessments"
          accessibilityHint="Opens the assessment for this domain"
        >
          <Text
            style={{
              color: colors.tint as string,
              fontSize: fontSize(13),
              fontWeight: fontWeight(600) as any,
            }}
          >
            Take a check-in →
          </Text>
        </Pressable>
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
        const isOverdue = record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()

        if (!SELF_ASSESSMENTS_HUMAN_LABELS_ENABLED) {
          // Pre-chunk-58 render, kept behind the kill-switch.
          const bandTextColor = legacyBandColor(record.band, colors.tint as string)
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
                {typeof record.scores?.total === 'number' ? String(record.scores.total) : '—'}
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
        }

        // -------- Chunk 58 human-labeled render --------
        const def = getBandDef(String(record.instrumentId))
        const currScore = extractScore(def, record.scores)
        const band = def ? computeBand(def, currScore) : undefined

        // Trend from history — lookup by instrumentId (chunk 58 adversarial
        // verify fix: index-coupled lookup was fragile under refetch).
        // history is guaranteed newest-first by historyById's sort.
        //
        // Chunk 58 v2 verify fix (stale-history race): the summary list
        // (['assessments-trends'], 60s stale) can refresh while the
        // per-instrument history (['assessment-history:{id}'], 5min stale)
        // is still cached. In that window history[0] IS the prior of the
        // current record — not the current record itself — so history[1]
        // would be prior-of-prior. Detect by comparing completedAt: if
        // history[0].completedAt is older than record.completedAt, the
        // history is stale relative to the summary; use history[0] as
        // prior. Otherwise use history[1] as prior (history[0] is curr).
        const history = historyById.get(String(record.instrumentId)) ?? []
        let priorScore: number | undefined
        if (def && history.length >= 1) {
          const h0 = history[0]
          const h0IsCurrent =
            !!h0 &&
            !!h0.completedAt &&
            !!record.completedAt &&
            h0.completedAt >= record.completedAt
          const priorRecord = h0IsCurrent ? history[1] : history[0]
          priorScore = priorRecord ? extractScore(def, priorRecord.scores) : undefined
        }
        const trend = def ? computeTrend(def, currScore, priorScore) : undefined

        const pillColor = band ? TONE_COLORS[band.tone] : TONE_COLORS.neutral
        const pillLabel = band ? band.label : '—'
        const rawScoreText = formatScore(currScore)
        const humanTitle = def?.humanLabel ?? label

        // Chunk 58 adversarial-verify fix (a11y direction): read the
        // MEANING of the trend ("improving"/"worsening") into VoiceOver,
        // not the arrow direction ("trend up"/"trend down"). "Trend down"
        // on a pain card actually means the patient is improving.
        const trendA11y = trend
          ? trend.direction === 'flat'
            ? 'steady'
            : trend.tone === 'good'
              ? 'improving'
              : 'worsening'
          : undefined

        // CHUNK 93 (2026-07-23): direction-of-goodness announcement.
        // Old label: "Depression, Low, improving, 2w ago" — VoiceOver
        // user can't tell if "Low" is good or bad for this instrument.
        // New label: "Depression: low. Healthy. Trending downward.
        // Improving. 2w ago." — pill container + arrow read via one
        // composed sentence. Inner Text + arrow are marked hidden
        // (see below) so nothing gets double-announced.
        //
        // Rule (d): direction pulled from ASSESSMENT_BANDS via
        // getBandDef(def) — computeBand already folds direction into
        // band.tone (good/warn/bad), so bandDirectionPhrasing reads
        // tone rather than re-deriving the mapping.
        const directionPhrase = bandDirectionPhrasing(def, band)
        const arrowPhrase = trendArrowPhrasing(trend?.direction)
        const spokenBand = band ? pillLabel.toLowerCase() : 'no band available'
        const composedA11yLabel =
          `${humanTitle}: ${spokenBand}.` +
          (directionPhrase ? ` ${directionPhrase[0].toUpperCase()}${directionPhrase.slice(1)}.` : '') +
          (arrowPhrase ? ` ${arrowPhrase[0].toUpperCase()}${arrowPhrase.slice(1)}.` : '') +
          (trendA11y ? ` ${trendA11y[0].toUpperCase()}${trendA11y.slice(1)}.` : '') +
          ` ${formatRelative(record.completedAt)}` +
          (isOverdue ? '. Due.' : '.')

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
            accessibilityLabel={composedA11yLabel}
          >
            {/* Row 1: small-caps human label */}
            <Text
              numberOfLines={2}
              style={{
                color: colors.subtext,
                fontSize: fontSize(11),
                fontWeight: fontWeight(700) as any,
                textTransform: 'uppercase',
                letterSpacing: 0.6,
                marginBottom: 8,
              }}
            >
              {humanTitle}
            </Text>

            {/* Row 2: High/Medium/Low pill — the visual focal point.
              * CHUNK 93 (2026-07-23): pill container is hidden from
              * VoiceOver so the outer Pressable's composed label
              * ("Depression: low. Healthy. Trending downward.")
              * reads once instead of the bare "Low" bubbling up.
              * accessibilityElementsHidden covers iOS;
              * importantForAccessibility="no-hide-descendants" covers
              * Android (the pill's dot + Text are decorative here).
              */}
            <View
              style={[
                styles.humanBandPill,
                {
                  borderColor: pillColor,
                  backgroundColor: pillColor + '1A', // ~10% alpha tint
                },
              ]}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            >
              <View style={[styles.bandDot, { backgroundColor: pillColor }]} />
              <Text
                numberOfLines={1}
                style={{
                  color: pillColor,
                  fontSize: fontSize(13),
                  fontWeight: fontWeight(700) as any,
                }}
              >
                {pillLabel}
              </Text>
            </View>

            {/* Row 3: trend arrow (reserves space so cards are same
              * height). CHUNK 93: hidden from VoiceOver — arrow shape
              * + "Improving/Worsening/Steady" are already spoken by
              * the parent Pressable's composed label. Keeping them
              * a11y-visible here would produce a double-read.
              */}
            <View
              style={styles.trendRow}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            >
              {trend ? (
                <>
                  <MaterialIcons
                    name={trendIconName(trend.direction)}
                    size={fontSize(16)}
                    color={TONE_COLORS[trend.tone]}
                  />
                  <Text
                    style={{
                      color: TONE_COLORS[trend.tone],
                      fontSize: fontSize(11),
                      fontWeight: fontWeight(600) as any,
                      marginLeft: 4,
                    }}
                  >
                    {trend.direction === 'flat'
                      ? 'Steady'
                      : trend.tone === 'good'
                        ? 'Improving'
                        : 'Worsening'}
                  </Text>
                </>
              ) : (
                <Text style={{ color: colors.subtext, fontSize: fontSize(11) }}>
                  {def
                    ? 'New — need 2 check-ins for trend'
                    : 'Trend unavailable'}
                </Text>
              )}
            </View>

            {/* Row 4: raw score caption (clinician view) + relative time */}
            <Text style={{ color: colors.subtext, fontSize: fontSize(10), marginTop: 6 }}>
              {`Score ${rawScoreText}  ·  ${formatRelative(record.completedAt)}`}
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
  humanBandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1.5,
    marginBottom: 8,
  },
  bandDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 18,
  },
  emptyCard: {
    marginHorizontal: 16,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // Match the populated carousel's rendered height (card minHeight 130
    // + 4 paddingTop + 8 paddingBottom = 142) so empty ↔ populated
    // doesn't cause a layout shift on the Health Trends screen.
    minHeight: 142,
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
