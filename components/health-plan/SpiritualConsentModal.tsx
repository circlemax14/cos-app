/**
 * SpiritualConsentModal — one-time warm consent surfaced before the user
 * enters their first spiritual check-in (FICA / HOPE / any instrument
 * with domain='spiritual').
 *
 * v1 (2026-07-28) — Ken's Sunday walk-and-talk locked-in default Q4.
 * Deliberately minimal so the design is easy to iterate on his feedback:
 * a single dismissable modal with warm copy, primary "Take the check-in"
 * CTA, secondary "Not now" that routes back to the catalog.
 *
 * OTA-safe: pure JS + RN primitives + MaterialIcons; no new native
 * modules (per feedback_ota_runtime_version_rule).
 *
 * Modal safety note (iOS 26.5): this Modal has NO awaited network calls
 * inside its handlers — the consent-write is fire-and-forget via
 * acknowledgeSpiritualConsent (see lib/spiritual-consent.ts) and both
 * dismiss paths (Take / Not now) close the Modal same-tick as the tap.
 * Matches Ken's chunk 40/41 fireAndForget pattern that structurally kills
 * the com.meta.react.turbomodulemanager.queue SIGABRT class.
 */

import React from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'

import { Colors } from '@/constants/theme'

type Palette = typeof Colors['light'] | typeof Colors['dark']

interface Props {
  visible: boolean
  instrumentLabel: string
  colors: Palette
  isDark: boolean
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string | number
  /** Called when the user acknowledges + wants to take the check-in.
   *  Parent must persist consent (acknowledgeSpiritualConsent) before
   *  hiding the modal so the next spiritual check-in doesn't re-prompt. */
  onAcknowledge: () => void
  /** Called when the user declines for now — parent routes back to
   *  catalog. No consent write; next visit re-prompts. */
  onDecline: () => void
}

export function SpiritualConsentModal(props: Props): React.JSX.Element {
  const {
    visible,
    instrumentLabel,
    colors,
    getScaledFontSize,
    getScaledFontWeight,
    onAcknowledge,
    onDecline,
  } = props

  // Warm accent — spiritual domain color from the wellbeing map
  // (DOMAIN_COLOR.social + a warm-brown accent Ken has used elsewhere).
  const accent = '#B45309'
  const accentBg = 'rgba(180,83,9,0.10)'

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onDecline}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onDecline} />
        <View style={[styles.sheet, { backgroundColor: colors.card ?? colors.background }]}>
          <View style={[styles.iconBubble, { backgroundColor: accentBg, borderColor: accent + '55' }]}>
            <MaterialIcons name="self-improvement" size={getScaledFontSize(40)} color={accent} />
          </View>

          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(20),
              fontWeight: getScaledFontWeight(700) as any,
              textAlign: 'center',
              marginTop: 16,
              paddingHorizontal: 8,
            }}
            accessibilityRole="header"
          >
            A gentle heads-up
          </Text>

          <ScrollView
            style={{ maxHeight: 240 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12 }}
            showsVerticalScrollIndicator={false}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(15),
                lineHeight: getScaledFontSize(22),
                textAlign: 'center',
              }}
            >
              &ldquo;{instrumentLabel}&rdquo; explores your faith, meaning, and what gives you
              strength. Some questions ask about religion or spiritual practice.
            </Text>

            <View style={{ marginTop: 14, gap: 10 }}>
              <BulletRow
                icon="lock"
                color={accent}
                fontSize={getScaledFontSize}
                fontWeight={getScaledFontWeight}
                text={
                  <>
                    <Text style={{ fontWeight: getScaledFontWeight(700) as any }}>Everything you share stays private</Text>
                    {' '}— only your care team can see it, and only if you have one.
                  </>
                }
                textColor={colors.text}
              />
              <BulletRow
                icon="skip-next"
                color={accent}
                fontSize={getScaledFontSize}
                fontWeight={getScaledFontWeight}
                text={
                  <>
                    <Text style={{ fontWeight: getScaledFontWeight(700) as any }}>You can skip any question</Text>
                    {' '}or leave your answer as a couple of words.
                  </>
                }
                textColor={colors.text}
              />
              <BulletRow
                icon="favorite-border"
                color={accent}
                fontSize={getScaledFontSize}
                fontWeight={getScaledFontWeight}
                text={
                  <>
                    <Text style={{ fontWeight: getScaledFontWeight(700) as any }}>There are no right answers</Text>
                    {' '}— every faith, belief, and non-belief is welcome here.
                  </>
                }
                textColor={colors.text}
              />
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              onPress={onDecline}
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel="Not now, close this check-in"
            >
              <Text style={{ color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any }}>
                Not now
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onAcknowledge}
              style={[styles.primaryBtn, { backgroundColor: accent }]}
              accessibilityRole="button"
              accessibilityLabel={`Take the ${instrumentLabel} check-in`}
            >
              <MaterialIcons name="arrow-forward" size={18} color="#FFFFFF" />
              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: getScaledFontSize(14),
                  fontWeight: getScaledFontWeight(700) as any,
                }}
              >
                Take the check-in
              </Text>
            </TouchableOpacity>
          </View>

          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(11),
              textAlign: 'center',
              marginTop: 12,
              paddingHorizontal: 20,
              lineHeight: getScaledFontSize(15),
              fontStyle: 'italic',
            }}
          >
            You&rsquo;ll only see this note once. It won&rsquo;t appear before your other spiritual check-ins.
          </Text>
        </View>
      </View>
    </Modal>
  )
}

interface BulletProps {
  icon: keyof typeof MaterialIcons.glyphMap
  color: string
  text: React.ReactNode
  textColor: string
  fontSize: (n: number) => number
  fontWeight: (n: number) => string | number
}

function BulletRow(props: BulletProps): React.JSX.Element {
  const { icon, color, text, textColor, fontSize } = props
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <MaterialIcons name={icon} size={fontSize(18)} color={color} style={{ marginTop: 2 }} />
      <Text
        style={{
          color: textColor,
          fontSize: fontSize(13),
          lineHeight: fontSize(19),
          flex: 1,
        }}
      >
        {text}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    width: '86%',
    maxWidth: 420,
    borderRadius: 20,
    paddingVertical: 20,
    alignItems: 'center',
  },
  iconBubble: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
    paddingHorizontal: 20,
    width: '100%',
  },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    flex: 2,
    flexDirection: 'row',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
