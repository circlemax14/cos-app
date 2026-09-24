/**
 * COS-1096 — the health-age dial contents, drawn ONCE.
 *
 * Companion to WellbeingDialHero, and for the same reason: Ken screenshotted
 * app/Home/health-age.tsx and asked for that view on Home, so Home must render
 * the screen's own stack rather than a lookalike that drifts from it.
 *
 * ─── WHAT HOME DOES NOT GET, AND WHY ─────────────────────────────────
 *
 * The detail screen also shows a week-change pill ("no change from last
 * week"), computed by weekChange() from the health-age HISTORY buckets. Home
 * does not fetch that history, and adding a query to the cold-start screen to
 * render one pill is a bad trade on the surface whose launch cost we are most
 * careful about.
 *
 * So it is an optional `extra` slot: the detail screen passes its pill, Home
 * passes nothing. An honest omission, not a silent divergence — every other
 * element is the same component with the same numbers.
 */

import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { formatAge, gapPhrase } from '@/lib/health-age-presentation'

export interface HealthAgeBandTokens {
  fg: string
  bg: string
  label: string
}

export interface HealthAgeDialHeroProps {
  /** The computed health age. `—` is rendered when absent. */
  overall: number | null
  /**
   * Health age minus chronological age. Drives the plain-language line, which
   * is the whole finding — "8.3 years younger" rather than "vs chronological
   * age 44", which makes the reader do the subtraction.
   */
  gap: number | null
  /** Already-formatted "As of ..." string, or null when the date is unusable. */
  asOf?: string | null
  tokens?: HealthAgeBandTokens | null
  textColor: string
  subtextColor: string
  getScaledFontSize: (n: number) => number
  /** The detail screen's week-change pill. Home has no history to compute it. */
  extra?: React.ReactNode
  /** 1 is the detail screen; Home passes less so the same stack fits its ring. */
  scale?: number
}

export function HealthAgeDialHero({
  overall,
  gap,
  asOf,
  tokens,
  textColor,
  subtextColor,
  getScaledFontSize,
  extra,
  scale = 1,
}: HealthAgeDialHeroProps): React.JSX.Element {
  const phrase = gapPhrase(gap)
  const phraseTone =
    phrase.direction === 'younger'
      ? '#0F6B36'
      : phrase.direction === 'older'
        ? '#8A5100'
        : subtextColor

  return (
    <>
      <Text
        style={{
          color: textColor,
          fontSize: getScaledFontSize(19 * scale),
          fontWeight: '700',
          textAlign: 'center',
        }}
        numberOfLines={1}
      >
        Health Age
      </Text>

      {asOf ? (
        <Text
          style={{
            color: subtextColor,
            fontSize: getScaledFontSize(13 * scale),
            marginTop: 1,
            textAlign: 'center',
          }}
          numberOfLines={1}
        >
          {asOf}
        </Text>
      ) : null}

      {/*
        ONE DECIMAL, not a rounded integer. A figure that moves about a year
        annually earns it — rounding to "36" hides every change smaller than
        six months, which is most of them. formatAge is shared with the detail
        screen so the two can never print the same number differently.
      */}
      {typeof overall === 'number' ? (
        <Text
          style={{
            color: tokens?.fg ?? textColor,
            fontSize: getScaledFontSize(52 * scale),
            lineHeight: getScaledFontSize(60 * scale),
            fontWeight: '800',
            letterSpacing: -1.5,
            marginTop: 4 * scale,
            textAlign: 'center',
          }}
          accessibilityLabel={`Your Health Age is ${formatAge(overall)} years`}
        >
          {formatAge(overall)}
        </Text>
      ) : (
        <Text
          style={{
            color: subtextColor,
            fontSize: getScaledFontSize(48 * scale),
            fontWeight: '700',
            marginTop: 4 * scale,
          }}
        >
          —
        </Text>
      )}

      {phrase.text ? (
        <Text
          style={{
            color: phraseTone,
            fontSize: getScaledFontSize(16 * scale),
            fontWeight: '700',
            marginTop: 1,
            textAlign: 'center',
          }}
          numberOfLines={1}
        >
          {phrase.text}
        </Text>
      ) : null}

      {extra}

      {tokens ? (
        <View style={[styles.chip, { backgroundColor: tokens.bg, marginTop: 8 * scale }]}>
          <Text
            style={[
              styles.chipLabel,
              { color: tokens.fg, fontSize: getScaledFontSize(11 * scale) },
            ]}
          >
            {tokens.label}
          </Text>
        </View>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'center',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  chipLabel: {
    fontWeight: '700',
    letterSpacing: 0.4,
  },
})
