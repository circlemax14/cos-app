/**
 * A screen-level error boundary. There was no error boundary anywhere in this
 * app before this file.
 *
 * WHAT THAT COST, 2026-08-15: Health Summary threw, and because nothing caught
 * it the whole process aborted — expo-updates' error-recovery queue raised, and
 * the crash report showed `abort()` six seconds after launch. From the patient's
 * side the app simply vanished. From ours, the native crash log contained no JS
 * frames at all, so it could not say which component threw or why. A boundary
 * turns both of those around: the app stays up, and we get the error.
 *
 * WRAPPED INSIDE THE SCREEN, NOT AROUND THE TAB NAVIGATOR. Deliberate. If the
 * boundary sat above the tabs, catching would replace the entire shell and the
 * patient would be stranded with no way out. Wrapped inside, the tab bar
 * survives and they can simply walk to another screen — which for most of these
 * screens is a complete recovery, because the failure is one screen's data.
 *
 * NOT A LICENCE TO STOP FIXING THINGS. A caught error is still a bug; this only
 * decides whether the patient loses one screen or the whole app while we fix it.
 * `onError` reports so a swallowed error is never a silent one.
 *
 * iOS 26.5+ envelope: View / Text / Pressable / MaterialIcons / StyleSheet.
 * Class component because componentDidCatch has no hook equivalent.
 */

import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'

interface Props {
  children: React.ReactNode
  /** Named in the report so we know which screen threw. */
  screen: string
  /** Reporter seam; defaults to console so tests need no Sentry. */
  onError?: (error: Error, info: { componentStack: string }, screen: string) => void
}

interface State {
  error: Error | null
}

function defaultReport(
  error: Error,
  info: { componentStack: string },
  screen: string,
): void {
  // Imported lazily so a screen that never throws does not pull the SDK, and so
  // a Sentry failure can never itself become the thing that crashes the app.
  try {

    const Sentry = require('@sentry/react-native') as {
      captureException?: (e: unknown, ctx?: unknown) => void
    }
    Sentry.captureException?.(error, {
      // No PHI: a screen name and a component stack, nothing from the data
      // that screen was rendering.
      tags: { screen },
      extra: { componentStack: info.componentStack },
    })
  } catch {
    // Reporting is best-effort. Never let it throw.
  }
  // Always leave a local trace too — Sentry is not enabled in every build.
  console.error(`[ScreenErrorBoundary:${screen}]`, error?.message ?? error)
}

export class ScreenErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }): void {
    const report = this.props.onError ?? defaultReport
    try {
      report(error, info, this.props.screen)
    } catch {
      // A throwing reporter must not re-enter the boundary.
    }
  }

  private reset = (): void => {
    this.setState({ error: null })
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <View style={styles.wrap}>
        <MaterialIcons name="refresh" size={32} color="#6B7280" />
        <Text style={styles.title}>This section didn&apos;t load</Text>
        {/* Says what to do, and does not blame the patient or imply their data
            is gone. Nothing here is their fault and nothing has been lost. */}
        <Text style={styles.body}>
          Something went wrong showing this page. Your information is safe — you
          can try again, or use another tab and come back.
        </Text>
        <Pressable
          onPress={this.reset}
          style={styles.btn}
          accessibilityRole="button"
          accessibilityLabel="Try loading this section again"
        >
          <Text style={styles.btnText}>Try again</Text>
        </Pressable>
      </View>
    )
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { fontSize: 17, fontWeight: '700', color: '#111827', marginTop: 12, textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 20, color: '#6B7280', marginTop: 8, textAlign: 'center' },
  btn: {
    marginTop: 20,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: '#0F766E',
    minHeight: 44,
    justifyContent: 'center',
  },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
})

export default ScreenErrorBoundary
