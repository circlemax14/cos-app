/**
 * "About this medication" — SCRUM-674b, the visible half.
 *
 * Ken 2026-08-14: when a medication is added, tell the patient what it is for,
 * its side effects, and whether it is a steroid.
 *
 * EVERY WORD HERE CAME OFF AN FDA LABEL. Nothing is generated, and the source
 * line is not decoration — it is the difference between "the label says this"
 * and "an app told me this", and the patient is entitled to know which they
 * are reading.
 *
 * Renders NOTHING when the lookup finds nothing. That covers the flag being
 * off (the endpoint 404s), the drug not being in openFDA, and any outage —
 * all of which are indistinguishable to the patient and none of which are
 * worth an error message they cannot act on.
 *
 * iOS 26.5 envelope: View / Text / MaterialIcons / StyleSheet only.
 */
import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useQuery } from '@tanstack/react-query'

import { fetchDrugLabel } from '@/services/api/drug-label'

export interface DrugLabelFactsProps {
  name: string
  colors: { text: string; subtext: string; border: string; card: string; tint: string }
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
}

export function DrugLabelFactsBlock({
  name,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: DrugLabelFactsProps): React.JSX.Element | null {
  const { data, isLoading } = useQuery({
    queryKey: ['drug-label', name.trim().toLowerCase()],
    queryFn: () => fetchDrugLabel(name),
    enabled: name.trim() !== '',
    // Labels are static documents and the backend caches for a day; this just
    // stops a re-render from re-asking.
    staleTime: 60 * 60 * 1000,
    retry: false,
  })

  // WHILE FETCHING, SHOW THAT SOMETHING IS COMING.
  //
  // Vishal 2026-08-18: "when I click on active medication name then there is
  // no loader which shows we are fetching something."
  //
  // He was right, and the cause is one line: `isLoading` was never read. The
  // early return below fires on the first render — when `data` is still
  // undefined — so expanding a medication rendered NOTHING, waited on a call
  // that reaches api.fda.gov, and then popped a block in. Indistinguishable
  // from a drug we have no label for, which is the one thing this must not be
  // confused with.
  //
  // A STATIC skeleton, not a spinner: ADR-0003's envelope keeps animation off
  // these surfaces, and three grey bars in the shape of the block that is
  // about to arrive tell the patient more about what is coming than a
  // rotating circle does.
  if (isLoading) {
    return (
      <View
        style={[styles.wrap, { borderColor: colors.border }]}
        accessible
        accessibilityLabel="Looking up information about this medication"
        accessibilityRole="progressbar"
      >
        <View style={styles.head}>
          <MaterialIcons name="info-outline" size={getScaledFontSize(15)} color={colors.subtext} />
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(12),
              fontWeight: getScaledFontWeight(700) as never,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            Looking this up…
          </Text>
        </View>
        {/* Widths deliberately uneven — a stack of identical bars reads as a
            rendering fault rather than as text that has not arrived. */}
        <View style={[styles.skeletonBar, { backgroundColor: colors.border, width: '38%', marginTop: 12 }]} />
        <View style={[styles.skeletonBar, { backgroundColor: colors.border, width: '92%', marginTop: 6 }]} />
        <View style={[styles.skeletonBar, { backgroundColor: colors.border, width: '74%', marginTop: 4 }]} />
      </View>
    )
  }

  if (!data?.found) return null

  const hasAnything = data.usage || data.sideEffects || data.isCorticosteroid !== undefined
  if (!hasAnything) return null

  const label = (t: string) => (
    <Text
      style={{
        color: colors.subtext,
        fontSize: getScaledFontSize(11),
        fontWeight: getScaledFontWeight(700) as never,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        marginTop: 10,
      }}
    >
      {t}
    </Text>
  )

  const body = (t: string) => (
    <Text style={{ color: colors.text, fontSize: getScaledFontSize(13), lineHeight: 19, marginTop: 3 }}>
      {t}
    </Text>
  )

  return (
    <View style={[styles.wrap, { borderColor: colors.border }]}>
      <View style={styles.head}>
        <MaterialIcons name="info-outline" size={getScaledFontSize(15)} color={colors.subtext} />
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(13),
            fontWeight: getScaledFontWeight(700) as never,
            marginLeft: 6,
          }}
        >
          About this medication
        </Text>
      </View>

      {data.usage ? (
        <>
          {label('What it is used for')}
          {body(data.usage)}
        </>
      ) : null}

      {data.sideEffects ? (
        <>
          {label('Possible side effects')}
          {body(data.sideEffects)}
        </>
      ) : null}

      {/* Tri-state. `undefined` means the label carries no pharmacologic
          class, which is NOT "no" — so nothing is rendered rather than a
          reassurance we cannot support. */}
      {data.isCorticosteroid === true ? (
        <>
          {label('Steroid')}
          {body('The label lists this as a corticosteroid.')}
        </>
      ) : data.isCorticosteroid === false ? (
        <>
          {label('Steroid')}
          {body('The label does not list this as a corticosteroid.')}
        </>
      ) : null}

      {/* Not decoration. This is what separates "the label says" from "an app
          said", and the patient is entitled to know which they are reading. */}
      <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(10), marginTop: 10 }}>
        {data.retrievedAt
          ? `${data.source} · checked ${data.retrievedAt.slice(0, 10)}`
          : data.source}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, paddingTop: 10, borderTopWidth: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // Line-height of the body text this stands in for, so the block does not
  // jump size when the real content replaces it.
  skeletonBar: { height: 11, borderRadius: 4, opacity: 0.7 },
})
