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
  const { data } = useQuery({
    queryKey: ['drug-label', name.trim().toLowerCase()],
    queryFn: () => fetchDrugLabel(name),
    enabled: name.trim() !== '',
    // Labels are static documents and the backend caches for a day; this just
    // stops a re-render from re-asking.
    staleTime: 60 * 60 * 1000,
    retry: false,
  })

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
  head: { flexDirection: 'row', alignItems: 'center' },
})
