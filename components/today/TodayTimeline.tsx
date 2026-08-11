/**
 * Today's Schedule — one chronological spine.
 *
 * Ken 2026-08-11, with a reference mock: "This is where appts / routines and
 * tasks come together to build our daily schedule." Four stacked groups meant
 * 9am was described in three places and you merged the lists yourself to
 * answer "what's next?". Here time is the organising fact and type is an
 * attribute of the row.
 *
 * Vishal asked for something more sophisticated than the reference. What that
 * bought, beyond a coloured list:
 *
 *   - A NOW marker between the hours, so the day reads as past / here / ahead
 *     at a glance rather than requiring you to find the clock.
 *   - Past hours dimmed and the current hour weighted, so the eye lands on
 *     the part of the day you can still act on.
 *   - Only populated hours render. The mock draws every hour 6am–10pm, which
 *     on paper is a page and on a phone is a column of blank rows.
 *   - An explicit "Anytime today" bucket, so an item without a time is never
 *     silently dropped — that failure is exactly why the four-group layout
 *     was built in August.
 *
 * Colour is never the only signal: every row carries a shape as well as a
 * hue, matching the plan screen's existing rule (colour + icon + word). Three
 * dots differing only by hue fail for a colour-blind patient.
 *
 * iOS 26.5 envelope: View / Text / Pressable / MaterialIcons / StyleSheet.
 */

import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'

import type { Timeline, TimelineItem, TimelineKind } from '@/lib/today-timeline'

type Palette = { text: string; subtext: string; card: string; border: string; tint: string }

export interface TodayTimelineProps {
  timeline: Timeline
  /** Minutes since midnight — drives the NOW marker and past-hour dimming. */
  nowMinutes: number
  colors: Palette
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
  onPressItem?: (item: TimelineItem) => void
}

/**
 * Type vocabulary. Colours follow Ken's mock — appointments near-black,
 * routines magenta, tasks green — and each pairs with a distinct glyph so the
 * legend survives without colour.
 */
const KIND: Record<TimelineKind, { color: string; icon: keyof typeof MaterialIcons.glyphMap; label: string }> = {
  appointment: { color: '#111827', icon: 'event', label: 'Appointments' },
  routine: { color: '#A3195B', icon: 'repeat', label: 'Routines' },
  task: { color: '#137333', icon: 'check-circle-outline', label: 'Tasks' },
  reminder: { color: '#B45309', icon: 'notifications-none', label: 'Reminders' },
}

export function TodayLegend({
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: {
  colors: Palette
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
}): React.ReactElement {
  return (
    <View style={[styles.legend, { borderColor: colors.border }]} accessibilityRole="text">
      {(['appointment', 'routine', 'task'] as TimelineKind[]).map((k) => (
        <View key={k} style={styles.legendItem}>
          <View style={[styles.glyph, { backgroundColor: KIND[k].color }]}>
            <MaterialIcons name={KIND[k].icon} size={getScaledFontSize(10)} color="#FFFFFF" />
          </View>
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(11),
              fontWeight: getScaledFontWeight(700) as never,
              marginLeft: 5,
            }}
          >
            {KIND[k].label}
          </Text>
        </View>
      ))}
    </View>
  )
}

function Row({
  item,
  colors,
  sz,
  wt,
  onPress,
  dim,
}: {
  item: TimelineItem
  colors: Palette
  sz: (n: number) => number
  wt: (n: number) => string
  onPress?: (i: TimelineItem) => void
  dim: boolean
}): React.ReactElement {
  const meta = KIND[item.kind]
  const body = (
    <View style={[styles.row, dim && styles.dim]}>
      <View style={[styles.glyph, { backgroundColor: meta.color }]}>
        <MaterialIcons name={meta.icon} size={sz(10)} color="#FFFFFF" />
      </View>
      <View style={styles.rowText}>
        <Text
          style={{
            color: item.done ? colors.subtext : colors.text,
            fontSize: sz(14),
            lineHeight: sz(19),
            ...(item.done ? { textDecorationLine: 'line-through' as const } : {}),
          }}
        >
          {item.title}
        </Text>
        {item.detail ? (
          <Text style={{ color: colors.subtext, fontSize: sz(12), lineHeight: sz(16), marginTop: 1 }}>
            {item.detail}
          </Text>
        ) : null}
      </View>
      {item.done ? (
        <MaterialIcons name="check" size={sz(15)} color={KIND.task.color} />
      ) : null}
    </View>
  )

  if (!onPress) return body
  return (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`${meta.label.replace(/s$/, '')}: ${item.title}${item.done ? ', done' : ''}`}
      hitSlop={4}
    >
      {body}
    </Pressable>
  )
}

export function TodayTimeline({
  timeline,
  nowMinutes,
  colors,
  getScaledFontSize: sz,
  getScaledFontWeight: wt,
  onPressItem,
}: TodayTimelineProps): React.ReactElement {
  const { hours, anytime } = timeline
  const currentHour = Math.floor(nowMinutes / 60)

  return (
    <View>
      {hours.map((h, idx) => {
        const isPast = h.hour < currentHour
        const isNow = h.hour === currentHour
        // The NOW marker sits before the first hour that has not started yet,
        // so it reads as a line drawn across the day rather than a label
        // attached to one row.
        const showNowBefore =
          h.hour > currentHour && (idx === 0 || hours[idx - 1].hour <= currentHour)

        return (
          <View key={h.hour}>
            {showNowBefore ? <NowMarker colors={colors} sz={sz} wt={wt} /> : null}
            <View
              style={[
                styles.hour,
                // Hairline rule, NOT borderStyle:'dashed'. RN only honours a
                // dashed border when every side has a width; with just
                // borderTopWidth it falls back to solid on iOS and can draw
                // artifacts on Android. A hairline is what the rest of the
                // app uses and is what actually renders.
                idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
              ]}
            >
              <Text
                style={{
                  color: isNow ? colors.tint : colors.subtext,
                  fontSize: sz(12),
                  fontWeight: wt(isNow ? 800 : 700) as never,
                  width: 52,
                  paddingTop: 2,
                }}
              >
                {h.label}
              </Text>
              <View style={styles.hourItems}>
                {h.items.map((it) => (
                  <Row
                    key={it.id}
                    item={it}
                    colors={colors}
                    sz={sz}
                    wt={wt}
                    onPress={onPressItem}
                    dim={isPast && !it.done}
                  />
                ))}
              </View>
            </View>
          </View>
        )
      })}

      {/* Day already over — the marker still belongs at the end. */}
      {hours.length > 0 && hours[hours.length - 1].hour <= currentHour ? (
        <NowMarker colors={colors} sz={sz} wt={wt} />
      ) : null}

      {anytime.length > 0 ? (
        <View style={[styles.anytime, { borderTopColor: colors.border }]}>
          <Text
            style={{
              color: colors.subtext,
              fontSize: sz(11),
              fontWeight: wt(800) as never,
              letterSpacing: 0.7,
              marginBottom: 8,
            }}
          >
            ANYTIME TODAY
          </Text>
          {anytime.map((it) => (
            <Row key={it.id} item={it} colors={colors} sz={sz} wt={wt} onPress={onPressItem} dim={false} />
          ))}
        </View>
      ) : null}

      {hours.length === 0 && anytime.length === 0 ? (
        <Text style={{ color: colors.subtext, fontSize: sz(14), paddingVertical: 18, textAlign: 'center' }}>
          Nothing scheduled today.
        </Text>
      ) : null}
    </View>
  )
}

function NowMarker({
  colors,
  sz,
  wt,
}: {
  colors: Palette
  sz: (n: number) => number
  wt: (n: number) => string
}): React.ReactElement {
  return (
    <View style={styles.now} accessibilityRole="text" accessibilityLabel="Now">
      <Text style={{ color: colors.tint, fontSize: sz(10), fontWeight: wt(800) as never, width: 52 }}>
        NOW
      </Text>
      <View style={[styles.nowLine, { backgroundColor: colors.tint }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  glyph: {
    width: 17,
    height: 17,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  hour: { flexDirection: 'row', paddingVertical: 11 },
  hourItems: { flex: 1, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rowText: { flex: 1 },
  // Past and not done — still legible, just not competing with what is ahead.
  dim: { opacity: 0.55 },
  now: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  nowLine: { flex: 1, height: 2, borderRadius: 1 },
  anytime: { marginTop: 14, paddingTop: 12, borderTopWidth: 1 },
})
