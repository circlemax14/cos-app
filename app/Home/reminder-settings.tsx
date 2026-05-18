import React from 'react'
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { Card } from 'react-native-paper'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import {
  fetchHealthPlanReminderPrefs,
  updateHealthPlanReminderPrefs,
  type HealthPlanReminderPrefs,
} from '@/services/api/notification-prefs'

interface SlotSpec {
  key: keyof HealthPlanReminderPrefs
  title: string
  subtitle: string
  iconName: keyof typeof MaterialIcons.glyphMap
}

const SLOTS: SlotSpec[] = [
  { key: 'am',     title: 'Morning kickoff', subtitle: 'Around 9:00 AM — what\'s on your plan today', iconName: 'wb-sunny' },
  { key: 'midday', title: 'Midday check-in', subtitle: 'Around 1:00 PM — pending tasks reminder', iconName: 'schedule' },
  { key: 'eod',    title: 'End of day', subtitle: 'Around 7:00 PM — final nudge before bed', iconName: 'nightlight-round' },
]

/**
 * Settings screen for Health Plan reminder push notifications. Lets users
 * opt out of each daily slot (am / midday / eod). Default state is all-on
 * — server treats missing prefs as opted-in.
 *
 * Reachable from the side menu under My Health → Reminders.
 */
export default function ReminderSettingsScreen(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['reminder-prefs'],
    queryFn: fetchHealthPlanReminderPrefs,
  })

  const mutation = useMutation({
    mutationFn: (partial: Partial<HealthPlanReminderPrefs>) => updateHealthPlanReminderPrefs(partial),
    onSuccess: (updated) => {
      queryClient.setQueryData(['reminder-prefs'], updated)
    },
  })

  const prefs = query.data ?? { am: true, midday: true, eod: true }

  return (
    <AppWrapper>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
            <MaterialIcons name="arrow-back" size={getScaledFontSize(24)} color={colors.text} />
          </Pressable>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(22),
              fontWeight: getScaledFontWeight(700) as any,
              marginLeft: 12,
              flex: 1,
            }}
          >
            Reminders
          </Text>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginBottom: 14 }}>
            Daily push reminders for your Health Plan tasks. We&apos;ll only notify you when you have pending tasks — completed days won&apos;t trigger reminders.
          </Text>

          {SLOTS.map((slot) => {
            const enabled = prefs[slot.key]
            return (
              <Card key={slot.key} style={[styles.row, { backgroundColor: colors.card }]}>
                <Card.Content style={styles.rowContent}>
                  <View style={[styles.iconWrap, { backgroundColor: (colors.tint as string) + '22' }]}>
                    <MaterialIcons name={slot.iconName} size={20} color={colors.tint as string} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(600) as any }}>
                      {slot.title}
                    </Text>
                    <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 2 }}>
                      {slot.subtitle}
                    </Text>
                  </View>
                  <Switch
                    value={enabled}
                    onValueChange={(value) => mutation.mutate({ [slot.key]: value })}
                    disabled={mutation.isPending}
                    accessibilityLabel={`${slot.title} ${enabled ? 'enabled' : 'disabled'}`}
                  />
                </Card.Content>
              </Card>
            )
          })}

          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11), marginTop: 18, lineHeight: 18 }}>
            Reminders use device push notifications. Allow notifications in your iOS / Android settings to receive them.
          </Text>
        </ScrollView>
      </View>
    </AppWrapper>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 12 },
  row: { marginBottom: 12, borderRadius: 12 },
  rowContent: { flexDirection: 'row', alignItems: 'center' },
  iconWrap: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
})
