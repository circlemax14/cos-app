/**
 * Crisis resources, shown inline where someone needs them.
 *
 * The decision of WHEN to render this lives in lib/crisis-support.ts. This
 * file only knows how to say it.
 *
 * TONE, which is most of the work here:
 *   - It states what is available. It does not name what the patient is
 *     feeling, does not say "you may be experiencing", does not thank them for
 *     sharing, and does not tell them to seek help.
 *   - No warning red. Red is the app's "something is wrong with your data"
 *     colour, and this is not an error state. A calm, warm surface is the
 *     right register — this should read as a hand offered, not an alarm.
 *   - No icon of a siren, an exclamation mark, or a warning triangle.
 *
 * INTERACTION:
 *   - Never blocks. There is no dismiss button because there is nothing to
 *     dismiss: it sits in the flow and the patient scrolls past it if they
 *     want to. A dismiss control would imply it was in their way.
 *   - Every row is a real tap target that actually dials or opens Messages.
 *     A phone number printed as text, in a moment like this, is a worse
 *     offering than none — it asks someone in distress to do the typing.
 *
 * iOS 26.5 envelope: View / Text / Pressable / MaterialIcons / Linking /
 * StyleSheet. No Modal, no Animated, no ActivityIndicator.
 */

import React from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'

import { Colors } from '@/constants/theme'
import { Radii, Spacing } from '@/constants/design-system'
import { useAccessibility } from '@/stores/accessibility-store'
import {
  CRISIS_RESOURCES,
  crisisResourceUrl,
  type CrisisResource,
} from '@/lib/crisis-support'

const ICON_FOR: Record<CrisisResource['kind'], keyof typeof MaterialIcons.glyphMap> = {
  call: 'phone-in-talk',
  text: 'chat-bubble-outline',
  emergency: 'local-hospital',
}

export function CrisisSupportCard({
  /** Leading line. Varies by where this is shown; keep it short and plain. */
  intro = 'Support is available right now, any time of day.',
}: {
  intro?: string
}): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const fs = getScaledFontSize
  const fw = getScaledFontWeight

  const open = React.useCallback((r: CrisisResource) => {
    // Failure is silent on purpose. A device with no dialler (a simulator, a
    // tablet without cellular) would otherwise throw an unhandled rejection
    // into this screen of all screens.
    Linking.openURL(crisisResourceUrl(r)).catch(() => {})
  }, [])

  return (
    <View
      style={[
        styles.card,
        {
          // Soft teal from the app's own tint rather than an alert colour.
          backgroundColor: (colors.tint as string) + '12',
          borderColor: (colors.tint as string) + '3D',
        },
      ]}
      accessibilityRole="summary"
    >
      <View style={styles.headerRow}>
        <MaterialIcons name="favorite-border" size={fs(18)} color={colors.tint as string} />
        <Text
          style={{
            color: colors.text,
            fontSize: fs(14),
            fontWeight: fw(700) as never,
            marginLeft: 8,
            flex: 1,
          }}
        >
          You don&apos;t have to sit with this alone
        </Text>
      </View>

      <Text style={{ color: colors.subtext, fontSize: fs(13), lineHeight: fs(19), marginTop: 6 }}>
        {intro}
      </Text>

      <View style={styles.list}>
        {CRISIS_RESOURCES.map((r) => (
          <Pressable
            key={r.value + r.kind}
            onPress={() => open(r)}
            style={({ pressed }) => [
              styles.row,
              {
                borderColor: colors.border as string,
                backgroundColor: (colors.card as string) + (pressed ? 'FF' : 'D9'),
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${r.label}. ${r.detail}.`}
            accessibilityHint={r.kind === 'text' ? 'Opens Messages' : 'Starts a call'}
          >
            <MaterialIcons name={ICON_FOR[r.kind]} size={fs(20)} color={colors.tint as string} />
            <View style={styles.rowText}>
              <Text style={{ color: colors.text, fontSize: fs(14), fontWeight: fw(600) as never }}>
                {r.label}
              </Text>
              <Text style={{ color: colors.subtext, fontSize: fs(12), marginTop: 1 }}>
                {r.detail}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={fs(20)} color={colors.subtext as string} />
          </Pressable>
        ))}
      </View>

      {/* Stated, not buried: these are US services, and the app should say so
          rather than hand an international patient a number that will not
          answer. */}
      <Text style={{ color: colors.subtext, fontSize: fs(11), marginTop: 10 }}>
        988 and the Crisis Text Line serve the US. Outside the US, contact your
        local emergency number.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: Radii.xl,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  list: { marginTop: Spacing.sm + 4, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: 12,
    // 56 clears the 44pt minimum even before font scaling.
    minHeight: 56,
    paddingVertical: 10,
    gap: 12,
  },
  rowText: { flex: 1 },
})
