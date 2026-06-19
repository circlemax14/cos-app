import React from 'react'
import { Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { IconSymbol } from '@/components/ui/icon-symbol'
import type { UseCalendarPermissions } from '@/hooks/use-calendar-permissions'

interface Props {
  permissions: UseCalendarPermissions
  children: React.ReactNode
}

/**
 * Three states:
 *   - isLoading: spinner
 *   - !granted && !prompted: "Allow" button that triggers the OS prompt
 *   - !granted && prompted: "Open Settings" button (iOS won't re-prompt)
 *   - granted: render children
 */
export function CalendarPermissionGate({ permissions, children }: Props) {
  const { settings, getScaledFontSize } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']

  if (permissions.isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.tint} />
      </View>
    )
  }
  if (permissions.state.granted) return <>{children}</>

  const needsSettings = permissions.state.prompted

  return (
    <View style={[styles.center, { backgroundColor: colors.background, padding: 24 }]}>
      <IconSymbol name="calendar" size={64} color={colors.tint} />
      <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(20) }]}>
        Calendar access needed
      </Text>
      <Text style={[styles.body, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
        {needsSettings
          ? 'Calendar access was previously declined. Open Settings to enable it so Circle Support Health can show your appointments alongside other calendars.'
          : 'Circle Support Health can show all your appointments — medical, work, and personal — together in one view. Tap Continue to grant calendar access.'}
      </Text>
      {/* SCRUM-279 (build 53): Apple Review 5.1.1(iv) — the pre-prompt
          button must not use words like "Allow" since that's reserved
          for the OS system sheet itself. Using "Continue" + neutral
          copy. iOS shows the actual permission sheet AFTER this tap. */}
      <Pressable
        onPress={needsSettings ? permissions.openSettings : permissions.request}
        style={({ pressed }) => [
          styles.primaryBtn,
          { backgroundColor: colors.tint, opacity: pressed ? 0.7 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={needsSettings ? 'Open Settings' : 'Continue to calendar permission'}
      >
        <Text style={[styles.primaryBtnLabel, { fontSize: getScaledFontSize(15) }]}>
          {needsSettings ? 'Open Settings' : 'Continue'}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontWeight: '700', marginTop: 16, textAlign: 'center' },
  body: { marginTop: 12, marginBottom: 24, textAlign: 'center', lineHeight: 22, maxWidth: 320 },
  primaryBtn: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, minWidth: 200, alignItems: 'center' },
  primaryBtnLabel: { color: '#fff', fontWeight: '700' },
})
