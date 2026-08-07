/**
 * SCRUM-644 followup — Daily Read detail screen.
 *
 * Reached from the Home tile via `router.push('/Home/daily-read')`. The
 * tile itself is copy-only + non-numeric by design (a categorical
 * narrative digest, not a score). This detail screen expands each
 * pillar with its state + one-liner + a link out to the pillar's own
 * dedicated detail screen where the numeric score lives.
 *
 * Layout (top → bottom):
 *   1. Hero: today's headline + tone chip
 *   2. Pillars section: one row per pillar (Habits / Glucose / Health age /
 *      Wellbeing), each with state, band chip if ready, one-liner, and
 *      a chevron that navigates to that pillar's own detail when available
 *   3. Methodology note — the "what is a daily read" copy
 *
 * iOS 26.5-hardened envelope: pure View / Text / Pressable /
 * MaterialIcons / StyleSheet. Mirrors app/Home/health-age.tsx.
 *
 * Terminology (product): "Daily Read" only.
 */

import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router } from 'expo-router'

import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { useDailyReadFlag } from '@/hooks/use-daily-read-flag'
import { useDailyRead } from '@/hooks/use-daily-read'
import type {
  DailyReadPillar,
  DailyReadPillarBand,
  DailyReadPillarKey,
  DailyReadPillarState,
} from '@/services/api/daily-read'

const BAND_TOKENS: Record<DailyReadPillarBand, { fg: string; bg: string; label: string }> = {
  good:      { fg: '#0F6B36', bg: '#E6F4EC', label: 'GOOD' },
  fair:      { fg: '#0B6963', bg: '#E0F2F1', label: 'FAIR' },
  attention: { fg: '#8A5100', bg: '#FDF3E4', label: 'ATTENTION' },
}

const STATE_LABELS: Record<DailyReadPillarState, string> = {
  ready: 'Ready',
  insufficient_data: 'Add data',
  flag_off: 'Coming soon',
}

// Where each pillar's own dedicated detail lives. `undefined` means the
// pillar doesn't have a drilldown yet — the row still renders but the
// chevron is hidden. Kept as a table so a new pillar destination is a
// single-line edit.
const PILLAR_DEST: Record<DailyReadPillarKey, string | undefined> = {
  healthAge: '/Home/health-age',
  wellbeing: '/Home/wellbeing-score',
  // Task completion drills into the plan, where the tasks that drive the
  // number actually live.
  taskCompletion: '/Home/health-plan',
  // Ken 2026-08-07: `readings` replaced the fixed habits + glucose rows. It
  // drills into Progress, which is where every self-reported measurement the
  // pillar summarises is charted.
  readings: '/Home/bps-progress',
}

const DISCLAIMER =
  'Daily Read is a narrative digest of the signals we have for you today. It is not a diagnosis and does not replace guidance from your care team.'

export default function DailyReadScreen(): React.JSX.Element {
  const flagEnabled = useDailyReadFlag()
  const { data, isLoading, isError } = useDailyRead(flagEnabled)
  const { getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors.light

  return (
    <AppWrapper>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={12}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          >
            <MaterialIcons name="arrow-back-ios" size={20} color={colors.text as string} />
          </Pressable>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(18),
              fontWeight: getScaledFontWeight(700) as any,
              flex: 1,
            }}
          >
            Daily Read
          </Text>
        </View>

        {!flagEnabled ? (
          <NotAvailable colors={colors} getScaledFontSize={getScaledFontSize} />
        ) : isLoading && !data ? (
          <Loading colors={colors} getScaledFontSize={getScaledFontSize} />
        ) : isError ? (
          <ErrorState colors={colors} getScaledFontSize={getScaledFontSize} />
        ) : !data || data.empty ? (
          <EmptyState colors={colors} getScaledFontSize={getScaledFontSize} getScaledFontWeight={getScaledFontWeight} />
        ) : (
          <>
            <Hero
              headlineText={data.headline.text}
              tone={data.headline.tone}
              generatedAt={data.generatedAt}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />

            <PillarSections
              pillars={data.pillars}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
          </>
        )}

        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(11),
            lineHeight: 16,
            marginTop: 24,
          }}
        >
          {DISCLAIMER}
        </Text>
      </ScrollView>
    </AppWrapper>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────

interface CommonProps {
  colors: typeof Colors.light
  getScaledFontSize: (n: number) => number
  getScaledFontWeight?: (n: number) => string | number
}

function NotAvailable({ colors, getScaledFontSize }: CommonProps): React.JSX.Element {
  return (
    <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), marginTop: 24 }}>
      This feature is not available yet.
    </Text>
  )
}

function Loading({ colors, getScaledFontSize }: CommonProps): React.JSX.Element {
  return (
    <View style={styles.centerBlock}>
      <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14) }}>Loading your daily read…</Text>
    </View>
  )
}

function ErrorState({ colors, getScaledFontSize }: CommonProps): React.JSX.Element {
  return (
    <View style={styles.centerBlock}>
      <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14) }}>
        We couldn&apos;t load your daily read. Pull down to try again.
      </Text>
    </View>
  )
}

function EmptyState({ colors, getScaledFontSize, getScaledFontWeight }: CommonProps): React.JSX.Element {
  return (
    <View style={styles.centerBlock}>
      <Text
        style={{
          color: colors.text,
          fontSize: getScaledFontSize(15),
          fontWeight: (getScaledFontWeight ? getScaledFontWeight(600) : '600') as any,
          textAlign: 'center',
        }}
      >
        Connect a data source to see your daily read.
      </Text>
      <Text
        style={{
          color: colors.subtext,
          fontSize: getScaledFontSize(13),
          textAlign: 'center',
          marginTop: 8,
        }}
      >
        Once your labs, wellbeing check-ins, or habit journal have data, this page will summarize them for you daily.
      </Text>
    </View>
  )
}

function Hero({
  headlineText,
  tone,
  generatedAt,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: CommonProps & { headlineText: string; tone: string; generatedAt: string }): React.JSX.Element {
  const dateStr = new Date(generatedAt).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
  return (
    <View style={styles.heroBlock}>
      <Text
        style={{
          color: colors.subtext,
          fontSize: getScaledFontSize(11),
          fontWeight: (getScaledFontWeight ? getScaledFontWeight(600) : '600') as any,
          letterSpacing: 0.8,
        }}
      >
        {dateStr.toUpperCase()}
      </Text>
      <Text
        style={{
          color: colors.text,
          fontSize: getScaledFontSize(22),
          fontWeight: (getScaledFontWeight ? getScaledFontWeight(700) : '700') as any,
          lineHeight: 30,
          marginTop: 8,
        }}
      >
        {headlineText}
      </Text>
      <View style={[styles.toneChip, toneChipStyle(tone)]}>
        <Text
          style={{
            color: toneChipTextColor(tone),
            fontSize: getScaledFontSize(10),
            fontWeight: (getScaledFontWeight ? getScaledFontWeight(700) : '700') as any,
            letterSpacing: 0.6,
          }}
        >
          {tone.toUpperCase()}
        </Text>
      </View>
    </View>
  )
}

/**
 * Splits pillars into ready-first + collapsed "add more data" expander
 * for the rest. Design decision (2026-08-05, Vishal): don't lead with
 * empty rows; keep discovery for connecting more signals a single tap
 * away instead of paying for real estate up-front.
 */
function PillarSections({
  pillars,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: CommonProps & { pillars: DailyReadPillar[] }): React.JSX.Element {
  const [expanded, setExpanded] = React.useState(false)
  const ready = pillars.filter((p) => p.state === 'ready')
  const other = pillars.filter((p) => p.state !== 'ready')

  return (
    <>
      {ready.length > 0 && (
        <>
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(11),
              fontWeight: (getScaledFontWeight ? getScaledFontWeight(600) : '600') as any,
              letterSpacing: 0.8,
              marginTop: 24,
              marginBottom: 12,
            }}
          >
            SIGNALS USED TODAY
          </Text>
          {ready.map((p) => (
            <PillarRow
              key={p.key}
              pillar={p}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
            />
          ))}
        </>
      )}

      {other.length > 0 && (
        <>
          <Pressable
            onPress={() => setExpanded((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={`Add more data. ${other.length} signal${other.length === 1 ? '' : 's'} available.`}
            accessibilityState={{ expanded }}
            hitSlop={8}
            style={({ pressed }) => [styles.expanderRow, pressed && styles.pressed]}
          >
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(11),
                fontWeight: (getScaledFontWeight ? getScaledFontWeight(600) : '600') as any,
                letterSpacing: 0.8,
              }}
            >
              ADD MORE DATA ({other.length})
            </Text>
            <MaterialIcons
              name={expanded ? 'expand-less' : 'expand-more'}
              size={20}
              color={colors.subtext as string}
              style={{ marginLeft: 6 }}
            />
          </Pressable>
          {expanded &&
            other.map((p) => (
              <PillarRow
                key={p.key}
                pillar={p}
                colors={colors}
                getScaledFontSize={getScaledFontSize}
                getScaledFontWeight={getScaledFontWeight}
              />
            ))}
        </>
      )}
    </>
  )
}

function PillarRow({
  pillar,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: CommonProps & { pillar: DailyReadPillar }): React.JSX.Element {
  const dest = PILLAR_DEST[pillar.key]
  const isReady = pillar.state === 'ready'
  const bandTokens = isReady && pillar.band ? BAND_TOKENS[pillar.band] : null
  const canNav = Boolean(dest)

  const body = (
    <View
      style={[
        styles.pillarCard,
        { backgroundColor: colors.card as string },
      ]}
    >
      <View style={styles.pillarHeader}>
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(15),
            fontWeight: (getScaledFontWeight ? getScaledFontWeight(600) : '600') as any,
            flex: 1,
          }}
        >
          {pillar.label}
        </Text>
        {bandTokens ? (
          <View style={[styles.bandChip, { backgroundColor: bandTokens.bg }]}>
            <Text
              style={{
                color: bandTokens.fg,
                fontSize: getScaledFontSize(10),
                fontWeight: (getScaledFontWeight ? getScaledFontWeight(700) : '700') as any,
                letterSpacing: 0.6,
              }}
            >
              {bandTokens.label}
            </Text>
          </View>
        ) : (
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(11),
              fontWeight: (getScaledFontWeight ? getScaledFontWeight(600) : '600') as any,
              letterSpacing: 0.5,
            }}
          >
            {STATE_LABELS[pillar.state].toUpperCase()}
          </Text>
        )}
        {canNav && (
          <MaterialIcons
            name="chevron-right"
            size={22}
            color={colors.subtext as string}
            style={{ marginLeft: 8 }}
          />
        )}
      </View>
      {pillar.oneLiner ? (
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(13),
            lineHeight: 18,
            marginTop: 6,
          }}
        >
          {pillar.oneLiner}
        </Text>
      ) : null}
    </View>
  )

  if (!canNav) return body

  return (
    <Pressable
      onPress={() => router.push(dest as never)}
      accessibilityRole="button"
      accessibilityLabel={`${pillar.label} details`}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  )
}

// ─── Style helpers ───────────────────────────────────────────────────

function toneChipStyle(tone: string): { backgroundColor: string } {
  switch (tone) {
    case 'positive': return { backgroundColor: '#E6F4EC' }
    case 'steady':   return { backgroundColor: '#E0F2F1' }
    case 'attention':return { backgroundColor: '#FDF3E4' }
    default:         return { backgroundColor: '#EEF0F2' }
  }
}
function toneChipTextColor(tone: string): string {
  switch (tone) {
    case 'positive': return '#0F6B36'
    case 'steady':   return '#0B6963'
    case 'attention':return '#8A5100'
    default:         return '#5A6270'
  }
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backBtn: { paddingRight: 8, paddingVertical: 4 },
  pressed: { opacity: 0.7 },
  heroBlock: { marginTop: 8 },
  toneChip: { alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  pillarCard: { padding: 14, borderRadius: 12, marginBottom: 10 },
  pillarHeader: { flexDirection: 'row', alignItems: 'center' },
  bandChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginLeft: 8 },
  centerBlock: { marginTop: 40, alignItems: 'center', paddingHorizontal: 24 },
  expanderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 12,
    paddingVertical: 4,
  },
})
