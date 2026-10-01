/**
 * RetakeRequestInboxCard (COS-482 Phase 1).
 *
 * Human-voiced inbox surface on Home when a care manager (or super-admin
 * from the unassigned pool) has asked the patient to redo an assessment
 * or full intake. Renders `null` when there are no pending requests —
 * silent-drop pattern, matches AssessmentDueBanner. Never renders any
 * "loading" / "error" chrome — the card is a nudge, not a spinner.
 *
 * iOS 26.5 primitive envelope (matches components/unified-plan/v2/net.ts
 * SIGABRT-avoidance discipline enforced across the plan surface):
 *   ONLY: View / Text / Pressable / StyleSheet / MaterialIcons.
 *   NO   Modal / Animated / reanimated / gesture-handler / bottom-sheet
 *        libs / paper components / Portal.
 *
 * The "Not now" affordance opens a full sheet SCREEN
 * (/Home/retake-snooze-sheet) rather than a bottom-sheet overlay, because
 * every bottom-sheet library the app has on hand (react-native-paper,
 * react-native-gesture-handler based sheets) crashes on iOS 26.5 the
 * moment Modal/Animated/Reanimated composes with the tap handler on the
 * card. The sheet screen renders its own Pressable scrim and the same
 * primitives, so it's SIGABRT-safe by construction.
 *
 * On tap paths:
 *   - Start now → the FIRST check-in the request still owes, with the rest
 *     carried as a queue (COS-1181 — see `startNow`; a scope is resolved here,
 *     not by sending the patient to the catalog to pick). `retakeStartRoute`
 *     remains for the keys with nowhere to walk: a single instrument, which it
 *     opens directly, and `full-intake`, which has its own wizard.
 *   - Not now  → /Home/retake-snooze-sheet?id=<requestId>, and only when the
 *     request is not mandatory (COS-1179).
 *   - Snooze/Dismiss are handled by the sheet screen (which owns the
 *     mutation hooks) — this card is READ-only for the row body.
 *
 * A11y contract:
 *   - Outer card carries a composed accessibilityLabel so a screen reader
 *     announces "Your care team asked you to retake Anxiety check-in. Takes
 *     ~4 minutes." as one utterance. No member of staff is named (COS-1168)
 *     and the ask is the card's own named phrase (COS-1202/1203) — which is
 *     always SAYABLE: before the catalog resolves it is the server's noun, never
 *     a placeholder, because this utterance and the Start button's label are
 *     built from it too. Inner Text nodes are hidden from a11y
 *     (importantForAccessibility="no-hide-descendants") so the reader
 *     doesn't repeat every fragment.
 *   - Both buttons have role="button" + composed accessibilityLabel.
 *
 * PII discipline: the render composes only the enriched fields the BE ships —
 * requesterPhrase (agencyName is the local fallback), estMinutes, the optional
 * short note, and instrumentKey, which is named from the catalog rather than
 * printed. No email, no last name, and since COS-1168 no staff first name or
 * role token either: both are still ON the row and are deliberately unread.
 */

import React, { useCallback, useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'

import { getColors, Radii, Spacing } from '@/constants/design-system'
import { retakeStartRoute } from '@/lib/retake-routes'
import { parseRetakeScopeKey, retakeTrackOf, type RetakeTrackName } from '@/lib/retake-queue'
import { retakeAskPhrase, retakeAskPhraseNeedsTitles } from '@/lib/retake-request-copy'
import { getWarmerInstrumentLabel } from '@/lib/instrument-labels'
import { RETAKE_GATE_ROUTE } from '@/lib/notification-routing'
import { fetchInstruments, fetchRecommendedInstruments } from '@/services/api/instruments'
import { useAccessibility } from '@/stores/accessibility-store'
import { usePendingRetakeRequests } from '@/hooks/use-retake-requests'
import { useBiopsychosocialPlan } from '@/hooks/use-biopsychosocial-plan'
import { useRetakeQueue } from '@/hooks/use-retake-queue'
import type { PatientRetakeRequestView } from '@/services/api/retake-requests'

/*
 * COS-1168 — humanRole() deleted.
 *
 * It mapped the BE role token to a patient-facing word ("CARE_MANAGER" →
 * "Care Manager", "SUPER_ADMIN" → "Admin") so the card could print
 * "Admin BrightFuture asked you to...". The patient is no longer told which
 * member of staff asked, or in what role, so there is nothing left to map.
 * See requesterPhraseFor below.
 */

function estMinutesLabel(n: number): string {
  if (n <= 1) return '~1 minute'
  return `~${n} minutes`
}

/**
 * Compose the a11y announcement for the whole card. Kept as a pure fn so
 * the routing + contract tests can pin the exact utterance shape.
 */
export function composeRetakeCardAccessibilityLabel(
  row: PatientRetakeRequestView,
  askPhrase: string,
): string {
  const who = requesterPhraseFor(row)
  /*
   * COS-1202 — `askPhrase`, not `row.instrumentDisplayName`.
   *
   * The server's name for a scope is `scopeDisplayName()`: "check-in",
   * "check-ins", "3 check-ins". A screen-reader user heard "Your care team
   * asked you to retake check-in" and had no more idea which one than a
   * sighted user reading the subtitle did. Both now read the same named
   * phrase, from one helper.
   */
  const what = `asked you to retake ${askPhrase}`
  const time = `Takes ${estMinutesLabel(row.estMinutes)}`
  return `${who} ${what}. ${time}.`
}

/**
 * COS-1168 — who the patient is told asked.
 *
 * The server composes this now (retake-request.service composeRequesterPhrase)
 * so the push and this card cannot word it differently, and so the wording can
 * change without an app release:
 *
 *   platform asks, patient has an agency → "Your care team, on behalf of X,"
 *   platform asks, no agency             → "Your care team"
 *   the patient's own agency asks        → "Your care team at X"
 *
 * The local fallback exists only for a binary talking to a backend that
 * predates the field. It deliberately does NOT reproduce the old
 * "Care Manager Sarah" / "Admin BrightFuture" wording: naming a member of
 * staff to a patient leaks who is looking at their record, which is half of
 * why this changed.
 */
function requesterPhraseFor(row: PatientRetakeRequestView): string {
  const fromServer = row.requesterPhrase?.trim()
  if (fromServer) return fromServer
  const agency = row.agencyName?.trim()
  return agency ? `Your care team at ${agency}` : 'Your care team'
}

/**
 * Deep-link target for "Start now".
 *
 * COS-1166 — the definition moved to lib/retake-routes.ts so the push
 * router can use it too (a pure module cannot import this .tsx). Re-exported
 * here so every existing import and test keeps working against one source.
 */
export { retakeStartRoute } from '@/lib/retake-routes'

export interface RetakeRequestInboxCardProps {
  /** COS-1182 — render only a request on this track. Omitted: the first of any. */
  track?: RetakeTrackName
  /**
   * COS-1191 — true when this card is rendered INSIDE the gate on the plan tab.
   *
   * Without it, a satisfied scope pushes the gate route from the gate itself,
   * which is a silent no-op. The gate passes this; Home does not.
   */
  onGateRoute?: boolean

  /**
   * Test-only override so contract tests can render with a fixed row list
   * without wiring the React Query hook + a QueryClientProvider. Prod
   * callers omit this and the component reads from the hook.
   */
  __testRows?: PatientRetakeRequestView[]
}

export function RetakeRequestInboxCard({
  track,
  onGateRoute,
  __testRows,
}: RetakeRequestInboxCardProps = {}): React.JSX.Element | null {
  // Hooks always run in the same order regardless of the test override so
  // React never sees a hook-count change across renders. Real callers
  // ignore the `__testRows` prop — the query still runs but its result is
  // discarded in favor of the fixture.
  const query = usePendingRetakeRequests()
  const rows = __testRows ?? query.data ?? []
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = getColors(settings.isDarkTheme)

  /*
   * COS-1182 — `track` lets a caller ask for ITS OWN request.
   *
   * The assessment and health-status tracks can both be outstanding at once
   * (COS-1178), and `rows[0]` is whichever the server listed first. Unfiltered,
   * the Health Status gate could render the assessment ask — naming the wrong
   * work and opening the wrong screen. Home still passes no track and shows
   * whatever is most pressing, which is the behaviour it has always had.
   */
  const first = track ? rows.find((r) => retakeTrackOf(r.instrumentKey) === track) : rows[0]
  const moreCount = Math.max(0, rows.length - 1)

  /*
   * COS-1181 — START THE WORK, never a picker.
   *
   * Vishal, 2026-09-30, third report of the same thing: "if I click on the start
   * now it is taking me to health check-ins ... Why can't I start the assessment
   * directly? I told you multiple times. When I click on start, assessments
   * should start one by one."
   *
   * `retakeStartRoute` sends a `domain:*` / `all-assessments` key to the CATALOG,
   * because until COS-1181 only the catalog could resolve a scope into the
   * patient's actual instruments. useRetakeQueue does that here now, so Start now
   * deep-links into the FIRST owed check-in carrying the rest of the queue, and
   * the stepper walks it to the end (COS-1174).
   *
   * Falls back to retakeStartRoute only when there is genuinely nothing to
   * resolve: a single instrument (it already opens directly), the health-status
   * intake (its own wizard), or a scope whose queue came back empty — which means
   * the patient has already answered everything, and the catalog is then the
   * honest destination rather than a stepper with no instrument.
   *
   * `queue.ready` matters: tapping while the three queries are still loading must
   * NOT fall through to the picker. COS-1192 below is how that is now done — the
   * tap is LATCHED and replayed, not refused. The button is never disabled.
   */
  const queue = useRetakeQueue(first ?? null)

  /*
   * COS-1192 — the FIRST tap counts, even before the queue resolves.
   *
   * Vishal: "still I have to click on start now twice."
   *
   * COS-1181 disabled the button until `queue.ready`, to stop a tap during load
   * falling through to the picker. That fixed the wrong outcome and created a
   * worse feel: the first tap lands on a disabled control, does nothing visible,
   * and he taps again.
   *
   * The intent is now LATCHED. Tap while loading and it is remembered; the
   * effect below fires it the moment the queue resolves. The button stays
   * enabled and says "Starting…" so the tap is visibly acknowledged — which is
   * the thing a disabled button never does.
   */
  const wantStartRef = React.useRef(false)

  const startNow = useCallback(() => {
    if (!first) return
    if (queue.ids.length > 0) {
      const next = encodeURIComponent(queue.ids[0])
      const rest = encodeURIComponent(queue.ids.join(','))
      router.push(
        `/Home/assessment-stepper?instrumentId=${next}&source=retake-request&queue=${rest}` as never,
      )
      return
    }
    /*
     * COS-1184 — a SCOPE with an empty queue must NOT fall to the catalog.
     *
     * With the watermark in place an empty scope queue means one thing: every
     * member is already satisfied, so the request is about to clear. The catalog
     * is the worst possible destination for that — its primary action is "Build
     * my plan", which is the screen Vishal has now reported four times.
     *
     * Send them to the gate instead. It re-reads the pending list, sees the
     * request clearing (or the rebuild starting) and shows the right thing.
     * `retakeStartRoute` stays only for keys with genuinely nowhere to walk: a
     * single instrument, which it opens directly, and the health-status intake,
     * which has its own wizard.
     */
    /*
     * COS-1191 — never navigate to the screen we are already on.
     *
     * COS-1184 sent a satisfied scope to the gate. But this card RENDERS INSIDE
     * that gate on the plan tab, so pushing the gate route from there is a
     * silent no-op — a tap that does visibly nothing, which is the single
     * failure Vishal has reported more than any other.
     *
     * The catalog is a worse destination and he has said so. But it is a
     * VISIBLE one, and with the set-narrowing fixed this branch is now only
     * reached when the request really is satisfied — at which point the catalog
     * showing "all complete" is the honest answer rather than a dead tap.
     *
     * `queue.resolved` still guards it: `ready && !resolved` means the inputs
     * failed, so an empty queue means nothing and we must not read it as
     * "satisfied".
     */
    if (queue.resolved && parseRetakeScopeKey(first.instrumentKey)) {
      if (!onGateRoute) {
        router.push(RETAKE_GATE_ROUTE as never)
        return
      }
      // Already on the gate: fall through to the catalog rather than no-op.
      router.push(retakeStartRoute(first.instrumentKey) as never)
      return
    }
    router.push(retakeStartRoute(first.instrumentKey) as never)
  }, [first, queue.ready, queue.resolved, queue.ids, onGateRoute])

  const onStartNow = useCallback(() => {
    if (!first) return
    if (!queue.ready) {
      // Latch it. The effect below picks it up when the data lands.
      wantStartRef.current = true
      return
    }
    startNow()
  }, [first, queue.ready, startNow])

  React.useEffect(() => {
    if (!queue.ready || !wantStartRef.current) return
    wantStartRef.current = false
    startNow()
  }, [queue.ready, startNow])

  const onNotNow = useCallback(() => {
    if (!first) return
    router.push(`/Home/retake-snooze-sheet?id=${encodeURIComponent(first.id)}` as never)
  }, [first])

  // COS-1175 — only consulted for the nothing-pending branch below.
  const plan = useBiopsychosocialPlan()
  const rebuilding = plan.data?.generating === true

  /*
   * COS-1202 — the catalog, so the card can NAME what it is asking for.
   *
   * Same key, queryFn and staleTime as AssessmentCatalogContent,
   * InlineAssessmentCatalog, assessment-detail and useRetakeQueue — one cache
   * entry between all five. For a SCOPE request useRetakeQueue above has
   * already asked for it, so this is a cache read.
   *
   * For a BARE instrument key it is not: useRetakeQueue gates its copy on
   * `scope !== null`, so nothing else on Home or the plan tab has asked, and
   * this really is the fetch — so on the first render of the headline COS-1197
   * card there is genuinely no title yet. `askPhrase` below names the request
   * from the server's noun in that window and upgrades in place; it does not
   * hold, and nothing on the card waits for this query.
   *
   * Titles must come from here and nowhere else; a hardcoded map on this card
   * would drift from the catalog the patient is about to open.
   */
  const instrumentsQuery = useQuery({
    queryKey: ['instruments-recommended'],
    queryFn: async () => {
      try {
        return await fetchRecommendedInstruments()
      } catch {
        const fallback = await fetchInstruments()
        return { instruments: fallback, rationale: {}, cached: false }
      }
    },
    staleTime: 5 * 60 * 1000,
    /*
     * COS-1203 — GATED, like the identical query in useRetakeQueue above.
     *
     * This hook runs ABOVE `if (!first) return ... : null`, so unguarded it made
     * every Home / plan-tab mount fetch the catalog for every patient — the
     * overwhelming majority of whom have no pending retake and see no card at
     * all, plus `basic`-plan patients for whom the route is tier-filtered to an
     * empty list anyway. A card that renders nothing must fetch nothing.
     *
     * The second clause is the narrower truth: a domain scope, the whole
     * battery, the health-status intake and an over-long set are all named from
     * fixed copy, so even a rendering card only needs the catalog when the
     * phrase will actually read a title out of it. The predicate lives next to
     * those branches in lib/retake-request-copy.ts so the two cannot drift.
     */
    enabled: !!first && retakeAskPhraseNeedsTitles(first.instrumentKey),
  })

  /*
   * COS-1202 — the one phrase that names the ask. FOUR surfaces read it:
   * the subtitle, the "What" cell, `composeRetakeCardAccessibilityLabel`'s
   * utterance, and the accessibilityLabel on "Start now".
   *
   * Which is why it must never be a placeholder with no words in it. Round 3 of
   * COS-1203 held this value behind an ellipsis until `instrumentsQuery`
   * resolved, reading it as "the subtitle only"; it is not, and for the length of
   * that fetch VoiceOver announced "…" on the one control a screen-reader user
   * activates. `retakeAskPhrase` therefore always returns the best READABLE name
   * it has — the server's `instrumentDisplayName` on a cold cache — and this memo
   * re-runs with the precise title when the query lands. The visible copy can
   * change once as it upgrades; an unreadable card cannot be fixed by waiting.
   *
   * Nothing here gates a render or an interaction: the card paints and "Start
   * now" is tappable before this query exists at all (COS-1192 — a
   * disabled-then-enabled button is the two-tap bug, reported four times).
   *
   * The subtitle was a literal reading "an assessment" and the What cell
   * showed the server's name for the scope, which is `scopeDisplayName()` —
   * "check-in", "check-ins", "3 check-ins". So a request scoped to ONE newly
   * added check-in (COS-1197) and one scoped to the whole battery rendered as
   * the same card. The scope was right and the deep link was right; nothing on
   * the card ever said WHICH, so COS-1197's acceptance criterion could not be
   * observed from the UI at all.
   *
   * The title is the SAME one the catalog card shows —
   * getWarmerInstrumentLabel over the BE name. If the two disagreed, the card
   * would name one thing and the screen it opens would show another.
   *
   * The subtitle gets two lines for it: three named check-ins do not fit on
   * one at an accessibility font scale, and truncating to "Anxiety check-in,
   * Sleep chec…" is the vague copy all over again.
   */
  const askPhrase = useMemo(() => {
    const defs = instrumentsQuery.data?.instruments ?? []
    return first
      ? retakeAskPhrase({
          instrumentKey: first.instrumentKey,
          titleOf: (id) => {
            const def = defs.find((i) => i.instrumentId === id)
            return def ? getWarmerInstrumentLabel(def.instrumentId, def.name) : undefined
          },
          fallback: first.instrumentDisplayName,
        })
      : ''
  }, [first, instrumentsQuery.data])

  const a11yLabel = useMemo(
    () => (first ? composeRetakeCardAccessibilityLabel(first, askPhrase) : ''),
    [first, askPhrase],
  )

  /*
   * Silent-drop when there's nothing pending. NEVER render an empty card,
   * a loading spinner, or an error banner from this surface — a nudge that
   * says "nothing to nudge you about" is anti-value.
   *
   * COS-1175 — with ONE exception. Vishal, 2026-09-30: "when the assessments
   * are completed and plan generation is happening then we need to show some
   * other message there". He answered everything, came back to Home, and the
   * card still read "time to reassess" — so the app was asking him to do work
   * he had just finished.
   *
   * This is status, not a nudge: it replaces the ask rather than adding a
   * second thing to act on, and it carries no buttons. On the plan screen
   * RetakeRequiredGate intercepts a rebuild before this renders, so the notice
   * appears where the ask used to be and nowhere else.
   */
  if (!first) {
    return rebuilding ? (
      <View
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        accessibilityRole="summary"
        accessibilityLabel="Rebuilding your plan. We will let you know as soon as it is ready."
      >
        <View style={styles.header} importantForAccessibility="no-hide-descendants">
          <View
            style={[styles.iconWrap, { backgroundColor: (colors.tint || '#008080') + '22' }]}
          >
            <MaterialIcons name="autorenew" size={20} color={colors.tint || '#008080'} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(13),
                fontWeight: getScaledFontWeight(600) as any,
              }}
            >
              Rebuilding your plan
            </Text>
            <Text
              style={{
                color: colors.text + 'CC',
                fontSize: getScaledFontSize(11),
                marginTop: 1,
              }}
            >
              That is everything we needed — we will let you know as soon as it is ready.
            </Text>
          </View>
        </View>
      </View>
    ) : null
  }

  // COS-1168 — one server-composed clause; no staff name, no raw role token.
  const whoLine = requesterPhraseFor(first)

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.background,
          borderColor: colors.tint + '55',
        },
      ]}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={a11yLabel}
    >
      <View style={styles.header} importantForAccessibility="no-hide-descendants">
        <View
          style={[styles.iconWrap, { backgroundColor: (colors.tint || '#008080') + '22' }]}
        >
          <MaterialIcons name="assignment" size={20} color={colors.tint || '#008080'} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(13),
              fontWeight: getScaledFontWeight(600) as any,
            }}
          >
            {whoLine}
          </Text>
          {/* COS-1202 — named, from the request's own key. See askPhrase. */}
          <Text
            numberOfLines={2}
            style={{
              color: colors.text + 'CC',
              fontSize: getScaledFontSize(11),
              marginTop: 1,
            }}
          >
            {`asked you to retake ${askPhrase}`}
          </Text>
        </View>
      </View>

      {first.note ? (
        <View style={styles.noteWrap} importantForAccessibility="no-hide-descendants">
          <Text
            numberOfLines={3}
            style={{
              color: colors.text + 'DD',
              fontSize: getScaledFontSize(13),
              fontStyle: 'italic',
              lineHeight: 18,
            }}
          >
            {'“'}
            {first.note}
            {'”'}
          </Text>
        </View>
      ) : null}

      <View style={styles.detailsRow} importantForAccessibility="no-hide-descendants">
        <View style={styles.detailCell}>
          <Text
            style={{
              color: colors.text + '99',
              fontSize: getScaledFontSize(11),
              fontWeight: getScaledFontWeight(600) as any,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            What
          </Text>
          <Text
            numberOfLines={2}
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(14),
              fontWeight: getScaledFontWeight(600) as any,
              marginTop: 2,
            }}
          >
            {askPhrase}
          </Text>
        </View>
        <View style={styles.detailCell}>
          <Text
            style={{
              color: colors.text + '99',
              fontSize: getScaledFontSize(11),
              fontWeight: getScaledFontWeight(600) as any,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Time
          </Text>
          <Text
            numberOfLines={1}
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(14),
              fontWeight: getScaledFontWeight(600) as any,
              marginTop: 2,
            }}
          >
            {estMinutesLabel(first.estMinutes)}
          </Text>
        </View>
      </View>

      {moreCount > 0 ? (
        <View importantForAccessibility="no-hide-descendants">
          <Text
            style={{
              color: colors.text + '99',
              fontSize: getScaledFontSize(11),
              marginTop: Spacing.xs,
            }}
          >
            {`+${moreCount} more request${moreCount === 1 ? '' : 's'} pending`}
          </Text>
        </View>
      ) : null}

      <View style={styles.ctaRow}>
        <Pressable
          onPress={onStartNow}
          /*
           * COS-1192 — ENABLED while loading, so the first tap is not thrown
           * away. COS-1181 disabled it to stop a tap falling through to the
           * picker; the latch in onStartNow achieves that without eating the
           * press.
           */
          accessibilityRole="button"
          /*
           * COS-1203 — `askPhrase`, not `first.instrumentDisplayName`.
           *
           * This is the one control a screen-reader user actually activates, and
           * it was the last thing on the card still reading the server's
           * `scopeDisplayName()`. VoiceOver announced the precise subtitle and
           * then "Start check-in now" — or "Start 3 check-ins now" for a whole
           * battery. One phrase, every surface of the card.
           */
          accessibilityLabel={`Start ${askPhrase} now`}
          accessibilityState={{ busy: !queue.ready }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => [
            styles.primaryBtn,
            {
              backgroundColor: colors.tint || '#008080',
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: getScaledFontSize(14),
              fontWeight: getScaledFontWeight(600) as any,
            }}
          >
            {/* Acknowledges the tap, which a disabled button never did. */}
            {queue.ready ? 'Start now' : 'Starting…'}
          </Text>
        </Pressable>

        {/*
          * COS-1179 — no "Not now" on a MANDATORY request.
          *
          * Vishal, 2026-09-30, on a mandatory all-assessments request: "when I
          * clicked on not now it took me to a screen that when would you like to
          * be reminded ... But I'm not able to click on any[,] so what is the use
          * of this screen if I cannot click on anything".
          *
          * Every option on that sheet was guaranteed to fail. The server has
          * refused snooze AND dismiss on mandatory rows since #10b
          * (MandatoryRequestError → 409), the row has carried the flag since
          * then, and NO client surface read it — so the card kept offering a
          * door the server keeps locked. Same shape as COS-1162's alertLevel:
          * computed, serialised, and read by nothing.
          *
          * Mandatory is bounded by the 14-day expiry sweeper (COS-762), so
          * removing the escape hatch does not strand anyone indefinitely.
          */}
        {first.mandatory === true ? (
          <View style={styles.secondaryBtn}>
            <Text
              style={{
                color: colors.text + '99',
                fontSize: getScaledFontSize(12),
              }}
            >
              Required — can&apos;t be postponed
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={onNotNow}
            accessibilityRole="button"
            accessibilityLabel="Not now — choose to snooze or dismiss"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={({ pressed }) => [
              styles.secondaryBtn,
              {
                borderColor: colors.tint || '#008080',
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text
              style={{
                color: colors.tint || '#008080',
                fontSize: getScaledFontSize(14),
                fontWeight: getScaledFontWeight(600) as any,
              }}
            >
              {'Not now ▾'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    padding: Spacing.md,
    borderWidth: 1,
    borderRadius: Radii.lg ?? 12,
    gap: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  noteWrap: {
    paddingHorizontal: 4,
  },
  detailsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  detailCell: {
    flex: 1,
    minWidth: 0,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Radii.md ?? 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Radii.md ?? 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    backgroundColor: 'transparent',
  },
})

export default RetakeRequestInboxCard
