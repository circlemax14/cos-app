/**
 * SCRUM-641 — Proactive Nudges opt-in screen.
 *
 * Gated by `useProactiveNudgesFlag()`. While the backend flag is OFF
 * (dark launch) this screen is unreachable (no entry point in
 * reminder-settings, and even direct-nav renders a "not available" state
 * — mirror of the readiness screen dark-launch behavior).
 *
 * Wired to cos-backend routes:
 *   GET  /v1/patients/me/notification-prefs/nudges       -> NudgePreferences
 *   PUT  /v1/patients/me/notification-prefs/nudges       -> upsert
 *   POST /v1/patients/me/notification-prefs/nudges/mute  -> per-rule mute
 *   GET  /v1/nudges/rules                                -> catalog for mute list
 *
 * PHI note (echoing the backend guarantee): the notification title/body
 * never include patient names or vitals values. This screen only renders
 * rule descriptions from the catalog — no thresholds, no personal data.
 */

import React from 'react'
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native'
import { Card } from 'react-native-paper'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import * as Notifications from 'expo-notifications'

import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { useProactiveNudgesFlag } from '@/hooks/use-proactive-nudges-flag'
import { useCanRender } from '@/hooks/use-entitlement'
import {
  fetchNudgePrefs,
  fetchNudgeRules,
  toggleNudgeMute,
  updateNudgePrefs,
  type NudgePreferences,
  type NudgeRuleSummary,
  type UpdateNudgePrefsPayload,
} from '@/services/api/proactive-nudges'

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

const DAILY_CAP_MIN = 1
const DAILY_CAP_MAX = 5
const WEEKLY_CAP_MIN = 3
const WEEKLY_CAP_MAX = 14

const QUIET_HOURS_OPTIONS = [
  '20:00', '21:00', '22:00', '23:00', '00:00',
  '05:00', '06:00', '07:00', '08:00', '09:00',
] as const

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export default function NudgesScreen(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const queryClient = useQueryClient()
  const flagEnabled = useProactiveNudgesFlag()

  // Entitlement gate for the screen body. A hook, so it is declared above the
  // flag-off early return below. useCanRender fails open — false only on an
  // affirmative deny. The ScreenHeader (and its Back control) stays outside
  // the gate so a denied patient is never stranded here.
  const canView = useCanRender('nudges.view')

  const [permissionStatus, setPermissionStatus] =
    React.useState<Notifications.PermissionStatus | null>(null)

  React.useEffect(() => {
    let cancelled = false
    Notifications.getPermissionsAsync()
      .then((res) => {
        if (!cancelled) setPermissionStatus(res.status)
      })
      .catch(() => {
        if (!cancelled) setPermissionStatus(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const prefsQuery = useQuery({
    queryKey: ['nudge-prefs'],
    queryFn: fetchNudgePrefs,
    enabled: flagEnabled,
  })

  const rulesQuery = useQuery({
    queryKey: ['nudge-rules'],
    queryFn: fetchNudgeRules,
    enabled: flagEnabled,
  })

  const prefsMutation = useMutation({
    mutationFn: (payload: UpdateNudgePrefsPayload) => updateNudgePrefs(payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(['nudge-prefs'], updated)
      // Feature flag payload doesn't depend on prefs, but the reminders
      // page reads the same flag — no harm invalidating.
      void queryClient.invalidateQueries({ queryKey: ['feature-flags'] })
      void queryClient.invalidateQueries({ queryKey: ['nudge-prefs'] })
    },
    onError: (err: unknown) => {
      Alert.alert('Could not save', extractErrorMessage(err))
    },
  })

  const muteMutation = useMutation({
    mutationFn: ({ ruleId, muted }: { ruleId: string; muted: boolean }) =>
      toggleNudgeMute(ruleId, muted),
    onSuccess: (mutedRuleIds) => {
      const current = queryClient.getQueryData<NudgePreferences>(['nudge-prefs'])
      if (current) {
        queryClient.setQueryData(['nudge-prefs'], { ...current, mutedRuleIds })
      } else {
        void queryClient.invalidateQueries({ queryKey: ['nudge-prefs'] })
      }
    },
    onError: (err: unknown) => {
      Alert.alert('Could not update mute', extractErrorMessage(err))
    },
  })

  async function requestNotificationsPermission() {
    try {
      const res = await Notifications.requestPermissionsAsync()
      setPermissionStatus(res.status)
      if (res.status !== 'granted') {
        Alert.alert(
          'Notifications disabled',
          Platform.OS === 'ios'
            ? 'Open Settings → Notifications → Circle Support to enable pushes.'
            : 'Open App Info → Notifications to enable pushes.',
        )
      }
    } catch {
      // no-op — user will still see the CTA and can retry
    }
  }

  if (!flagEnabled) {
    // Belt-and-suspenders: if someone deep-links here while the flag is OFF,
    // render a benign "not available" state instead of a broken screen.
    return (
      <AppWrapper>
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <ScreenHeader
            title="Proactive nudges"
            onBack={() => router.back()}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
          />
          <View style={{ padding: 24 }}>
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14) }}>
              This feature is not available yet.
            </Text>
          </View>
        </View>
      </AppWrapper>
    )
  }

  const isLoading = prefsQuery.isLoading || rulesQuery.isLoading
  const prefs = prefsQuery.data
  const rules = rulesQuery.data ?? []

  return (
    <AppWrapper>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader
          title="Proactive nudges"
          onBack={() => router.back()}
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        />
        {canView && (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginBottom: 14, lineHeight: 19 }}>
            AI check-ins based on your recent trends. We only send a nudge when
            we have a helpful reason to — and we never include your health
            details in the notification itself.
          </Text>

          {permissionStatus === 'denied' ? (
            <Card style={[styles.row, { backgroundColor: colors.card, marginBottom: 16 }]}>
              <Card.Content>
                <Text style={{ color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any, marginBottom: 6 }}>
                  Notifications are turned off
                </Text>
                <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginBottom: 10, lineHeight: 18 }}>
                  Enable notifications in your device settings so we can send
                  nudges when you opt in.
                </Text>
                <Pressable
                  onPress={requestNotificationsPermission}
                  accessibilityRole="button"
                  accessibilityLabel="Enable notifications"
                  style={({ pressed }) => [
                    { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.tint as string, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Text style={{ color: '#fff', fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(600) as any }}>
                    Enable notifications
                  </Text>
                </Pressable>
              </Card.Content>
            </Card>
          ) : null}

          {isLoading || !prefs ? (
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginTop: 12 }}>
              Loading your preferences…
            </Text>
          ) : (
            <>
              {/* Master opt-in */}
              <Card style={[styles.row, { backgroundColor: colors.card }]}>
                <Card.Content style={styles.rowContent}>
                  <View style={[styles.iconWrap, { backgroundColor: (colors.tint as string) + '22' }]}>
                    <MaterialIcons name="notifications-active" size={20} color={colors.tint as string} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(600) as any }}>
                      Receive proactive nudges
                    </Text>
                    <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 2 }}>
                      Turn on to let us send gentle, PHI-free check-ins.
                    </Text>
                  </View>
                  <Switch
                    value={prefs.optedIn}
                    onValueChange={(value) => {
                      const timezoneIana = prefs.timezoneIana || deviceTimezone()
                      prefsMutation.mutate({ optedIn: value, timezoneIana })
                    }}
                    disabled={prefsMutation.isPending}
                    accessibilityLabel={`Proactive nudges ${prefs.optedIn ? 'enabled' : 'disabled'}`}
                  />
                </Card.Content>
              </Card>

              {/* Quiet hours */}
              <SectionLabel colors={colors} getScaledFontSize={getScaledFontSize} getScaledFontWeight={getScaledFontWeight}>
                Quiet hours
              </SectionLabel>
              <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginBottom: 10, lineHeight: 18 }}>
                We won&apos;t send nudges between these times (local: {prefs.timezoneIana || deviceTimezone()}).
              </Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TimeStepper
                  label="Start"
                  value={prefs.quietHoursStart}
                  onChange={(v) =>
                    prefsMutation.mutate({
                      quietHoursStart: v,
                      timezoneIana: prefs.timezoneIana || deviceTimezone(),
                    })
                  }
                  disabled={prefsMutation.isPending || !prefs.optedIn}
                  colors={colors}
                  getScaledFontSize={getScaledFontSize}
                  getScaledFontWeight={getScaledFontWeight}
                />
                <TimeStepper
                  label="End"
                  value={prefs.quietHoursEnd}
                  onChange={(v) =>
                    prefsMutation.mutate({
                      quietHoursEnd: v,
                      timezoneIana: prefs.timezoneIana || deviceTimezone(),
                    })
                  }
                  disabled={prefsMutation.isPending || !prefs.optedIn}
                  colors={colors}
                  getScaledFontSize={getScaledFontSize}
                  getScaledFontWeight={getScaledFontWeight}
                />
              </View>

              {/* Frequency caps */}
              <SectionLabel colors={colors} getScaledFontSize={getScaledFontSize} getScaledFontWeight={getScaledFontWeight}>
                Frequency limits
              </SectionLabel>
              <CapStepper
                title="Daily max"
                subtitle={`Between ${DAILY_CAP_MIN} and ${DAILY_CAP_MAX} nudges per day`}
                value={prefs.dailyCap}
                min={DAILY_CAP_MIN}
                max={DAILY_CAP_MAX}
                onChange={(v) =>
                  prefsMutation.mutate({
                    dailyCap: clamp(v, DAILY_CAP_MIN, DAILY_CAP_MAX),
                    timezoneIana: prefs.timezoneIana || deviceTimezone(),
                  })
                }
                disabled={prefsMutation.isPending || !prefs.optedIn}
                colors={colors}
                getScaledFontSize={getScaledFontSize}
                getScaledFontWeight={getScaledFontWeight}
              />
              <CapStepper
                title="Weekly max"
                subtitle={`Between ${WEEKLY_CAP_MIN} and ${WEEKLY_CAP_MAX} nudges per week`}
                value={prefs.weeklyCap}
                min={WEEKLY_CAP_MIN}
                max={WEEKLY_CAP_MAX}
                onChange={(v) =>
                  prefsMutation.mutate({
                    weeklyCap: clamp(v, WEEKLY_CAP_MIN, WEEKLY_CAP_MAX),
                    timezoneIana: prefs.timezoneIana || deviceTimezone(),
                  })
                }
                disabled={prefsMutation.isPending || !prefs.optedIn}
                colors={colors}
                getScaledFontSize={getScaledFontSize}
                getScaledFontWeight={getScaledFontWeight}
              />

              {/* Per-rule mute list */}
              {rules.length > 0 ? (
                <>
                  <SectionLabel colors={colors} getScaledFontSize={getScaledFontSize} getScaledFontWeight={getScaledFontWeight}>
                    Which nudges
                  </SectionLabel>
                  <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginBottom: 10, lineHeight: 18 }}>
                    Toggle any individual nudge off if it&apos;s not useful.
                  </Text>
                  {rules.map((rule) => {
                    const muted = (prefs.mutedRuleIds ?? []).includes(rule.ruleId)
                    return (
                      <MuteRow
                        key={rule.ruleId}
                        rule={rule}
                        muted={muted}
                        disabled={muteMutation.isPending || !prefs.optedIn}
                        onToggle={(nextMuted) =>
                          muteMutation.mutate({ ruleId: rule.ruleId, muted: nextMuted })
                        }
                        colors={colors}
                        getScaledFontSize={getScaledFontSize}
                        getScaledFontWeight={getScaledFontWeight}
                      />
                    )
                  })}
                </>
              ) : null}

              <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11), marginTop: 22, lineHeight: 18 }}>
                Nudges reference your recent trends. We never include health
                details in the notification itself.
              </Text>
            </>
          )}
        </ScrollView>
        )}
      </View>
    </AppWrapper>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────

interface HeaderProps {
  title: string
  onBack: () => void
  colors: typeof Colors.light
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
}

function ScreenHeader({
  title, onBack, colors, getScaledFontSize, getScaledFontWeight,
}: HeaderProps): React.JSX.Element {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
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
        {title}
      </Text>
    </View>
  )
}

interface SectionLabelProps {
  children: React.ReactNode
  colors: typeof Colors.light
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
}

function SectionLabel({
  children, colors, getScaledFontSize, getScaledFontWeight,
}: SectionLabelProps): React.JSX.Element {
  return (
    <Text
      style={{
        color: colors.text,
        fontSize: getScaledFontSize(13),
        fontWeight: getScaledFontWeight(700) as any,
        marginTop: 22,
        marginBottom: 10,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </Text>
  )
}

interface TimeStepperProps {
  label: string
  value: string
  onChange: (next: string) => void
  disabled: boolean
  colors: typeof Colors.light
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
}

function TimeStepper({
  label, value, onChange, disabled, colors, getScaledFontSize, getScaledFontWeight,
}: TimeStepperProps): React.JSX.Element {
  const currentIndex = Math.max(
    0,
    QUIET_HOURS_OPTIONS.findIndex((o) => o === value),
  )
  function cycle(direction: 1 | -1) {
    if (disabled) return
    const next =
      (currentIndex + direction + QUIET_HOURS_OPTIONS.length) %
      QUIET_HOURS_OPTIONS.length
    onChange(QUIET_HOURS_OPTIONS[next])
  }
  return (
    <Card style={[styles.row, { backgroundColor: colors.card, flex: 1 }]}>
      <Card.Content>
        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11), textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
          {label}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <StepperButton icon="remove" onPress={() => cycle(-1)} disabled={disabled} colors={colors} getScaledFontSize={getScaledFontSize} />
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(18),
              fontWeight: getScaledFontWeight(700) as any,
              minWidth: 60,
              textAlign: 'center',
            }}
            accessibilityLabel={`${label} ${value}`}
          >
            {value}
          </Text>
          <StepperButton icon="add" onPress={() => cycle(1)} disabled={disabled} colors={colors} getScaledFontSize={getScaledFontSize} />
        </View>
      </Card.Content>
    </Card>
  )
}

interface CapStepperProps {
  title: string
  subtitle: string
  value: number
  min: number
  max: number
  onChange: (next: number) => void
  disabled: boolean
  colors: typeof Colors.light
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
}

function CapStepper({
  title, subtitle, value, min, max, onChange, disabled, colors, getScaledFontSize, getScaledFontWeight,
}: CapStepperProps): React.JSX.Element {
  const dec = () => !disabled && value > min && onChange(value - 1)
  const inc = () => !disabled && value < max && onChange(value + 1)
  return (
    <Card style={[styles.row, { backgroundColor: colors.card }]}>
      <Card.Content style={styles.rowContent}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(600) as any }}>
            {title}
          </Text>
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 2 }}>
            {subtitle}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <StepperButton icon="remove" onPress={dec} disabled={disabled || value <= min} colors={colors} getScaledFontSize={getScaledFontSize} />
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(18),
              fontWeight: getScaledFontWeight(700) as any,
              minWidth: 32,
              textAlign: 'center',
            }}
            accessibilityLabel={`${title} ${value}`}
          >
            {value}
          </Text>
          <StepperButton icon="add" onPress={inc} disabled={disabled || value >= max} colors={colors} getScaledFontSize={getScaledFontSize} />
        </View>
      </Card.Content>
    </Card>
  )
}

interface StepperButtonProps {
  icon: 'add' | 'remove'
  onPress: () => void
  disabled: boolean
  colors: typeof Colors.light
  getScaledFontSize: (n: number) => number
}

function StepperButton({ icon, onPress, disabled, colors, getScaledFontSize }: StepperButtonProps): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={icon === 'add' ? 'Increase' : 'Decrease'}
      style={({ pressed }) => [
        {
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: (colors.tint as string) + (disabled ? '11' : '22'),
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      <MaterialIcons
        name={icon}
        size={getScaledFontSize(20)}
        color={disabled ? colors.subtext : (colors.tint as string)}
      />
    </Pressable>
  )
}

interface MuteRowProps {
  rule: NudgeRuleSummary
  muted: boolean
  disabled: boolean
  onToggle: (nextMuted: boolean) => void
  colors: typeof Colors.light
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
}

function MuteRow({
  rule, muted, disabled, onToggle, colors, getScaledFontSize, getScaledFontWeight,
}: MuteRowProps): React.JSX.Element {
  return (
    <Card style={[styles.row, { backgroundColor: colors.card }]}>
      <Card.Content style={styles.rowContent}>
        <View style={[styles.iconWrap, { backgroundColor: (colors.tint as string) + '22' }]}>
          <MaterialIcons name="tips-and-updates" size={20} color={colors.tint as string} />
        </View>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={{ color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any }}>
            {rule.description}
          </Text>
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(11), marginTop: 2 }}>
            {rule.ruleId}
          </Text>
        </View>
        <Switch
          // Switch ON = nudge active. muted=true means the switch is OFF.
          value={!muted}
          onValueChange={(nextOn) => onToggle(!nextOn)}
          disabled={disabled}
          accessibilityLabel={`${rule.description} ${muted ? 'muted' : 'enabled'}`}
        />
      </Card.Content>
    </Card>
  )
}

// ─── Utilities ────────────────────────────────────────────────────────────

function extractErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string') {
    return (err as any).message
  }
  return 'Please try again.'
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
