/**
 * Retake "Not now" sheet route (COS-482 Phase 1).
 *
 * A full-screen pushed route (NOT a Modal or bottom-sheet library) that
 * lets the patient defer or dismiss a retake request. Same iOS 26.5
 * primitive envelope as the inbox card + plan-type-chooser (see file
 * headers in components/health-plan/retake-request/RetakeRequestInboxCard.tsx
 * and app/Home/plan-type-chooser.tsx for the SIGABRT background — every
 * bottom-sheet library the app has on hand crashes on iOS 26.5 the
 * moment Modal/Animated/Reanimated composes with the tap handler).
 *
 * Three snooze presets (Ken-approved defaults):
 *   - 1 day
 *   - 3 days
 *   - Weekend    (next Saturday 09:00 local)
 * Plus a "Doesn't apply to me" that POSTs a dismiss with reason
 * `not_applicable`. Both routes navigate back on success so the patient
 * lands on Home where the inbox card has already optimistically dropped
 * the row (see hooks/use-retake-requests.ts:onMutate).
 *
 * Failure UX: on error we don't leave a spinner. The mutation hook rolls
 * back the optimistic cache write, we surface a toast-shaped inline
 * banner ("Couldn't save — try again"), and the button re-enables. No
 * Alert.alert here (Alert renders a Modal → iOS 26.5 crash class).
 */

import React, { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router, Stack, useLocalSearchParams } from 'expo-router'

import { AppWrapper } from '@/components/app-wrapper'
import { getColors, Radii, Spacing } from '@/constants/design-system'
import { useAccessibility } from '@/stores/accessibility-store'
import {
  useDismissRetakeRequest,
  useSnoozeRetakeRequest,
} from '@/hooks/use-retake-requests'

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

/**
 * ISO helper: today + `days` days at same time. Kept pure so a snooze test
 * can pin the output. Uses Date arithmetic (not calendar rollovers) which
 * matches the BE zod schema's "future within 60 days" contract.
 */
function isoDaysFromNow(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  return d.toISOString()
}

/**
 * ISO for the next Saturday at 09:00 local. If today IS Saturday, we
 * still bump to next Saturday (a "weekend" snooze pointed at today would
 * be user-hostile — the patient asked for a defer, not zero delay).
 */
export function isoNextSaturdayMorning(now: Date = new Date()): string {
  const dow = now.getDay() // 0 Sun … 6 Sat
  const daysUntil = ((6 - dow + 7) % 7) || 7
  const target = new Date(now)
  target.setDate(now.getDate() + daysUntil)
  target.setHours(9, 0, 0, 0)
  return target.toISOString()
}

interface Preset {
  key: 'one_day' | 'three_days' | 'weekend'
  label: string
  sublabel: string
  computeIso: () => string
}

const PRESETS: Preset[] = [
  {
    key: 'one_day',
    label: '1 day',
    sublabel: 'Remind me tomorrow',
    computeIso: () => isoDaysFromNow(1),
  },
  {
    key: 'three_days',
    label: '3 days',
    sublabel: 'Give me a few days',
    computeIso: () => isoDaysFromNow(3),
  },
  {
    key: 'weekend',
    label: 'Weekend',
    sublabel: 'Saturday morning',
    computeIso: () => isoNextSaturdayMorning(),
  },
]

export default function RetakeSnoozeSheetRoute(): React.JSX.Element {
  const params = useLocalSearchParams<{ id?: string }>()
  const requestId = typeof params.id === 'string' ? params.id : ''

  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = getColors(settings.isDarkTheme)

  const snoozeMutation = useSnoozeRetakeRequest()
  const dismissMutation = useDismissRetakeRequest()

  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const busy = snoozeMutation.isPending || dismissMutation.isPending

  const closeAndReturn = useCallback(() => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace('/Home' as never)
    }
  }, [])

  const onSnooze = useCallback(
    (preset: Preset) => {
      if (!requestId || busy) return
      setErrorMsg(null)
      snoozeMutation.mutate(
        { id: requestId, untilIso: preset.computeIso() },
        {
          onSuccess: () => closeAndReturn(),
          onError: () => setErrorMsg("Couldn't save — try again."),
        },
      )
    },
    [busy, closeAndReturn, requestId, snoozeMutation],
  )

  const onDismiss = useCallback(() => {
    if (!requestId || busy) return
    setErrorMsg(null)
    dismissMutation.mutate(
      { id: requestId, reason: 'not_applicable' },
      {
        onSuccess: () => closeAndReturn(),
        onError: () => setErrorMsg("Couldn't save — try again."),
      },
    )
  }, [busy, closeAndReturn, dismissMutation, requestId])

  // Defensive: no id → nothing to act on. Show a lightweight fallback + a
  // Close so the patient can back out without staring at a mystery blank.
  if (!requestId) {
    return (
      <AppWrapper>
        <Stack.Screen options={{ title: 'Not now', headerBackTitle: 'Home' }} />
        <View style={styles.container}>
          <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), padding: Spacing.md }}>
            This request is no longer available.
          </Text>
          <Pressable
            onPress={closeAndReturn}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={[styles.dismissBtn, { borderColor: colors.tint || '#008080' }]}
          >
            <Text
              style={{
                color: colors.tint || '#008080',
                fontSize: getScaledFontSize(14),
                fontWeight: getScaledFontWeight(600) as any,
              }}
            >
              Close
            </Text>
          </Pressable>
        </View>
      </AppWrapper>
    )
  }

  return (
    <AppWrapper>
      <Stack.Screen options={{ title: 'Not now', headerBackTitle: 'Home' }} />
      <View style={styles.container}>
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(18),
            fontWeight: getScaledFontWeight(600) as any,
            paddingHorizontal: Spacing.md,
            paddingTop: Spacing.md,
          }}
        >
          When would you like to be reminded?
        </Text>
        <Text
          style={{
            color: colors.text + 'BB',
            fontSize: getScaledFontSize(13),
            paddingHorizontal: Spacing.md,
            marginTop: 4,
          }}
        >
          We&apos;ll show the request again then.
        </Text>

        <View style={styles.presetList}>
          {PRESETS.map((p) => (
            <Pressable
              key={p.key}
              disabled={busy}
              onPress={() => onSnooze(p)}
              accessibilityRole="button"
              accessibilityLabel={`Snooze ${p.label} — ${p.sublabel}`}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={({ pressed }) => [
                styles.presetBtn,
                {
                  backgroundColor: colors.background,
                  borderColor: (colors.tint || '#008080') + '55',
                  opacity: pressed || busy ? 0.85 : 1,
                },
              ]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: getScaledFontSize(15),
                    fontWeight: getScaledFontWeight(600) as any,
                  }}
                >
                  {p.label}
                </Text>
                <Text
                  style={{
                    color: colors.text + '99',
                    fontSize: getScaledFontSize(12),
                    marginTop: 2,
                  }}
                >
                  {p.sublabel}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={colors.text + '99'} />
            </Pressable>
          ))}
        </View>

        <View style={styles.divider} />

        <Pressable
          disabled={busy}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="This doesn't apply to me — dismiss the request"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => [
            styles.dismissBtn,
            {
              borderColor: colors.text + '33',
              opacity: pressed || busy ? 0.85 : 1,
            },
          ]}
        >
          <MaterialIcons name="block" size={18} color={colors.text + '99'} />
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(14),
              fontWeight: getScaledFontWeight(600) as any,
              marginLeft: 8,
            }}
          >
            This doesn&apos;t apply to me
          </Text>
        </Pressable>

        {errorMsg ? (
          <View
            style={[styles.errorBanner, { backgroundColor: '#FDECEC', borderColor: '#F5B5B5' }]}
            accessible
            accessibilityRole="alert"
            accessibilityLabel={errorMsg}
          >
            <MaterialIcons name="error-outline" size={18} color="#B23A3A" />
            <Text
              style={{
                color: '#7A2323',
                fontSize: getScaledFontSize(13),
                marginLeft: 8,
              }}
            >
              {errorMsg}
            </Text>
          </View>
        ) : null}
      </View>
    </AppWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: Spacing.lg,
  },
  presetList: {
    marginTop: Spacing.md,
    marginHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  presetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderWidth: 1,
    borderRadius: Radii.md ?? 10,
    minHeight: 56,
  },
  divider: {
    height: 1,
    backgroundColor: '#00000010',
    marginVertical: Spacing.md,
    marginHorizontal: Spacing.md,
  },
  dismissBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: Spacing.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: Radii.md ?? 10,
    minHeight: 44,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    padding: 10,
    borderWidth: 1,
    borderRadius: Radii.md ?? 10,
  },
})
