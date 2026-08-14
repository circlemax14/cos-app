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
import { View, Text, Pressable, StyleSheet, PixelRatio } from 'react-native'
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

/**
 * Glyph geometry that scales with the text — Ken 2026-08-14, testing with Bold
 * Text and a large text size: "icon and text don't align with each other".
 *
 * The glyph was a fixed 17pt box pinned at marginTop:1. That centres it on a
 * default-size line by luck, not by construction: at 2x scale the title's line
 * height becomes ~38pt while the box stays 17pt at the very top of it, so the
 * icon rides high above text that is centred in its own line.
 *
 * Sizing the box FROM the same scale as the text keeps the ratio fixed, and
 * deriving the offset from the line height centres it at any size rather than
 * at one.
 */
/**
 * The FINAL rendered size of a piece of text on this screen.
 *
 * `sz()` is the in-app scale, deliberately damped on phones. `getFontScale()`
 * is the OS Dynamic Type scale. Multiplying them gives what the text should
 * actually be — and because every Text here sets allowFontScaling={false},
 * this is exactly what it IS, rather than something React Native then scales
 * again behind us.
 *
 * That determinism is the point. The previous two attempts each tried to
 * predict what RN would do to a value after we set it — whether it scales an
 * explicit lineHeight, whether it touches a View — and each got one of those
 * predictions wrong. Opting out of the automatic scaling and doing all of it
 * in one place removes the guess: the glyph, the line box and the font all
 * come from the same number.
 *
 * Text still scales fully with the patient's settings; it just does so
 * predictably.
 */
function scaled(sz: (n: number) => number) {
  const fs = PixelRatio.getFontScale()
  return (n: number) => sz(n) * fs
}

function glyphGeometry(sz: (n: number) => number) {
  // PixelRatio.getFontScale() is the missing half, and without it the previous
  // fix could not work.
  //
  // getScaledFontSize DAMPS the OS scale on phones — effectiveFontScale caps
  // at 1.05 — deliberately, to stop layouts blowing up. But React Native then
  // applies the FULL iOS Dynamic Type scale to every <Text> on top of that,
  // because allowFontScaling defaults to true. A View gets no such treatment.
  //
  // So with large text the title renders at roughly sz(14) x 2 while a glyph
  // sized sz(17) does not move at all. Scaling the box by the same OS factor
  // the text is actually being rendered at is what makes them track.
  const f = scaled(sz)
  const size = f(17)
  const lineHeight = f(19) // must match the title's lineHeight below
  return {
    size,
    style: {
      width: size,
      height: size,
      borderRadius: size * 0.3,
      // Centre on the FIRST line of a title that may wrap to several.
      marginTop: Math.max(0, (lineHeight - size) / 2),
    },
    iconSize: Math.round(size * 0.6),
  }
}

export function TodayLegend({
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  showReminderKey = false,
  showTapHint = false,
}: {
  colors: Palette
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
  /**
   * Explain the bell — but only on days it appears. A key for a symbol that
   * is nowhere on screen is just another thing to read past.
   */
  showReminderKey?: boolean
  /**
   * Ken 2026-08-14: "How does the user know that they can check off tasks in
   * schedule screen?" The circle on each row is the affordance; this names it
   * once, in the key that already explains the other glyphs. Only shown when
   * there is something to check off, so it never describes an empty day.
   */
  showTapHint?: boolean
}): React.ReactElement {
  return (
    <View style={[styles.legend, { borderColor: colors.border }]} accessibilityRole="text">
      {/* Ken 2026-08-11: "we don't have reminders and we aren't showing
          them." Reminders were merged into the timeline but omitted from the
          legend, so an amber row had nothing explaining it. All four kinds
          are listed — a legend that only covers three of them is worse than
          none, because it implies the fourth colour means something else. */}
      {(['appointment', 'routine', 'task', 'reminder'] as TimelineKind[]).map((k) => (
        <View key={k} style={styles.legendItem}>
          <View
            style={[
              styles.glyph,
              glyphGeometry(getScaledFontSize).style,
              { marginTop: 0, backgroundColor: KIND[k].color },
            ]}
          >
            <MaterialIcons
              name={KIND[k].icon}
              size={glyphGeometry(getScaledFontSize).iconSize}
              color="#FFFFFF"
            />
          </View>
          <Text
            allowFontScaling={false}
            style={{
              color: colors.subtext,
              fontSize: scaled(getScaledFontSize)(11),
              fontWeight: getScaledFontWeight(700) as never,
              marginLeft: 5,
            }}
          >
            {KIND[k].label}
          </Text>
        </View>
      ))}
      {showTapHint ? (
        <View style={styles.legendItem}>
          <MaterialIcons
            name="radio-button-unchecked"
            size={scaled(getScaledFontSize)(13)}
            color={colors.subtext}
          />
          <Text
            allowFontScaling={false}
            style={{
              color: colors.subtext,
              fontSize: scaled(getScaledFontSize)(11),
              fontWeight: getScaledFontWeight(700) as never,
              marginLeft: 4,
            }}
          >
            Tap to check off
          </Text>
        </View>
      ) : null}
      {showReminderKey ? (
        <View style={styles.legendItem}>
          <MaterialIcons
            name="notifications-active"
            size={scaled(getScaledFontSize)(13)}
            color={colors.subtext}
          />
          <Text
            allowFontScaling={false}
            style={{
              color: colors.subtext,
              fontSize: scaled(getScaledFontSize)(11),
              fontWeight: getScaledFontWeight(700) as never,
              marginLeft: 4,
            }}
          >
            We&apos;ll remind you
          </Text>
        </View>
      ) : null}
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
  const f = scaled(sz)
  const glyph = glyphGeometry(sz)
  const body = (
    <View style={[styles.row, dim && styles.dim]}>
      <View style={[styles.glyph, glyph.style, { backgroundColor: meta.color }]}>
        <MaterialIcons name={meta.icon} size={glyph.iconSize} color="#FFFFFF" />
      </View>
      <View style={styles.rowText}>
        <Text
          // We apply the whole scale ourselves (see `scaled`), so RN must not
          // apply it a second time — that is what left the font and the line
          // box disagreeing, and the glyph centred on a height the text did
          // not occupy.
          allowFontScaling={false}
          style={{
            color: item.done ? colors.subtext : colors.text,
            fontSize: f(14),
            lineHeight: f(19),
            ...(item.done ? { textDecorationLine: 'line-through' as const } : {}),
          }}
        >
          {item.title}
        </Text>
        {item.detail ? (
          <Text
            allowFontScaling={false}
            style={{ color: colors.subtext, fontSize: f(12), lineHeight: f(16), marginTop: 1 }}
          >
            {item.detail}
          </Text>
        ) : null}
      </View>
      {/* SCRUM-666 — this row will actually buzz the phone at its hour.
          An attribute of the item, not a row of its own: a separate reminder
          entry beside the routine it reminds you of would double every timed
          thing on the screen. Only rendered when dispatch is genuinely live
          and the patient's category toggle is on — see TimelineItem.willRemind
          for why a bell that lies is the specific thing being fixed here. */}
      {item.willRemind && !item.done ? (
        <MaterialIcons
          name="notifications-active"
          size={f(13)}
          color={colors.subtext}
          accessibilityLabel="You'll be reminded"
          style={{ marginTop: Math.max(0, (f(19) - f(13)) / 2) }}
        />
      ) : null}
      {/* Ken 2026-08-14: "How does the user know that they can check off
          tasks in schedule screen?"

          They did not. A row showed a tick only AFTER it was done, so before
          that there was nothing on it suggesting a tap would do anything —
          the whole screen read as a list to look at, not one to act on.

          An empty circle is the affordance. It is the one control everybody
          already recognises as "you can tick this", it sits where the tick
          will land so the transition is legible, and it costs a row nothing
          when the item is already complete. Only rendered where a tap
          actually does something — a circle on an inert row would be a
          different lie. */}
      {/* Centred on the FIRST line like the kind glyph, so on a title that
          wraps to three lines the tick sits beside the words rather than
          floating at the top of a tall row. */}
      {onPress && !item.done ? (
        <MaterialIcons
          name="radio-button-unchecked"
          size={f(20)}
          color={colors.subtext}
          style={{ marginTop: Math.max(0, (f(19) - f(20)) / 2) }}
        />
      ) : null}
      {item.done ? (
        <MaterialIcons
          name="check-circle"
          size={f(20)}
          color={KIND.task.color}
          style={{ marginTop: Math.max(0, (f(19) - f(20)) / 2) }}
        />
      ) : null}
    </View>
  )

  if (!onPress) return body
  return (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={
        `${meta.label.replace(/s$/, '')}: ${item.title}` +
        (item.done ? ', done' : item.willRemind ? ", you'll be reminded" : '')
      }
      // VoiceOver users get the same discoverability the circle gives everyone
      // else — the label alone said what the row WAS, never what tapping did.
      accessibilityHint={item.done ? undefined : 'Double tap to check this off'}
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
  const f = scaled(sz)
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
                numberOfLines={1}
                allowFontScaling={false}
                style={{
                  color: isNow ? colors.tint : colors.subtext,
                  fontSize: f(12),
                  fontWeight: wt(isNow ? 800 : 700) as never,
                  // Tracks the RENDERED text, OS Dynamic Type included — at a
                  // fixed 52 (and even at a merely sz-scaled 52) the label
                  // wrapped, "10 am" became "10" / "am", and the whole hour
                  // block fell out of line with its items.
                  width: f(52),
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
            allowFontScaling={false}
            style={{
              color: colors.subtext,
              fontSize: f(11),
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
        <Text
          allowFontScaling={false}
          style={{ color: colors.subtext, fontSize: f(14), paddingVertical: 18, textAlign: 'center' }}
        >
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
  const f = scaled(sz)
  return (
    <View style={styles.now} accessibilityRole="text" accessibilityLabel="Now">
      <Text
        numberOfLines={1}
        allowFontScaling={false}
        style={{
          color: colors.tint,
          fontSize: f(10),
          fontWeight: wt(800) as never,
          width: f(52),
        }}
      >
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
  // Geometry comes from glyphGeometry() so it scales with the text; only the
  // centring of the icon INSIDE the box is static.
  glyph: { alignItems: 'center', justifyContent: 'center' },
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
