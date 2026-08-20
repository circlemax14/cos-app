/**
 * Route-level error boundary, wired through expo-router's own convention.
 *
 * WHY THIS EXISTS ALONGSIDE ScreenErrorBoundary
 * ScreenErrorBoundary (2026-08-15, after Health Summary aborted the process)
 * is applied by renaming a screen's default export and wrapping it. That is
 * the right shape, but it costs a multi-line edit per screen, and as of
 * 2026-08-19 only 5 of 79 routes had it. The other 74 were unprotected.
 *
 * expo-router already supports this natively: any route module that exports
 * `ErrorBoundary` is wrapped in its `Try` component —
 *     node_modules/expo-router/build/useScreens.js:139-148
 *     `if (ErrorBoundary) { ... <Try catch={ErrorBoundary}>{children}</Try> }`
 * and `Try` is a real class boundary with getDerivedStateFromError
 * (build/views/Try.d.ts). So a route opts in with ONE line:
 *
 *     export { ErrorBoundary } from '@/components/RouteErrorBoundary';
 *
 * WHY A FUNCTION COMPONENT IS CORRECT HERE
 * lib/screen-error-boundary.test.mjs rightly insists a boundary must be a
 * CLASS, because a function component catches nothing. That still holds — but
 * this file is not the boundary. expo-router's `Try` is the class that catches;
 * this is only the fallback UI it renders afterwards. Do not "fix" this into a
 * class: it would not be wired as a boundary either way.
 *
 * GRANULARITY — DELIBERATE
 * Export this from LEAF ROUTES, never from a `_layout.tsx`. The Tabs navigator
 * lives in app/Home/_layout.tsx; a boundary there would be caught ABOVE the tab
 * bar and replace the whole shell, stranding the patient with no way out. Kept
 * on the leaf, the tab bar survives and they can walk to another tab — which is
 * usually full recovery, because the failure is one screen's data.
 *
 * NOT A LICENCE TO STOP FIXING THINGS. A caught error is still a bug. This only
 * decides whether the patient loses one screen or the whole app in the meantime.
 *
 * iOS 26.5+ envelope: View / Text / Pressable / MaterialIcons / StyleSheet —
 * the same set ScreenErrorBoundary is restricted to. Nothing exotic renders on
 * a path that only runs when something has already gone wrong.
 *
 * The presentation deliberately mirrors ScreenErrorBoundary rather than
 * importing from it: that file's test asserts against its SOURCE TEXT (there is
 * no React renderer in this repo's `node --test` setup), so refactoring it to
 * share a fallback would break those assertions. Worth unifying later; not
 * worth destabilising the app's crash safety net to do it.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { usePathname } from 'expo-router';

/** Matches expo-router's ErrorBoundaryProps (build/views/Try.d.ts). */
export interface RouteErrorBoundaryProps {
  error: Error;
  retry: () => Promise<void>;
}

function report(error: Error, route: string): void {
  // Imported lazily so a route that never throws does not pull the SDK, and so
  // a Sentry failure can never itself become the thing that crashes the app.
  try {
    // require, not import: deliberate. A static import would pull the Sentry SDK
    // into every route's bundle graph even though this path only ever runs after
    // something has already thrown. Same pattern as ScreenErrorBoundary.tsx:51.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/react-native') as {
      captureException?: (e: unknown, ctx?: unknown) => void;
    };
    Sentry.captureException?.(error, {
      // No PHI: a route path and nothing from the data the screen was rendering.
      tags: { route, boundary: 'route' },
    });
  } catch {
    // Reporting is best-effort. Never let it throw.
  }
  // Always leave a local trace too — Sentry is not enabled in every build.
  console.error(`[RouteErrorBoundary:${route}]`, error?.message ?? error);
}

export function ErrorBoundary({ error, retry }: RouteErrorBoundaryProps): React.ReactElement {
  // Called unconditionally, and this fallback always renders inside the router
  // tree (Try wraps the route component), so the hook is safe here. It is what
  // tells us WHICH screen threw — expo-router does not pass that to the
  // fallback.
  const route = usePathname() || 'unknown';

  // Report once per mounted error, not on every re-render.
  const reported = React.useRef<Error | null>(null);
  if (reported.current !== error) {
    reported.current = error;
    report(error, route);
  }

  return (
    <View style={styles.wrap}>
      <MaterialIcons name="refresh" size={32} color="#6B7280" />
      <Text style={styles.title}>This screen didn&apos;t load</Text>
      {/* Says what to do, and does not blame the patient or imply their data is
          gone. Nothing here is their fault and nothing has been lost. */}
      <Text style={styles.body}>
        Something went wrong showing this page. Your information is safe — you
        can try again, or go back and come to it later.
      </Text>
      <Pressable
        onPress={() => {
          void retry();
        }}
        style={styles.btn}
        accessibilityRole="button"
        accessibilityLabel="Try loading this screen again"
      >
        <Text style={styles.btnText}>Try again</Text>
      </Pressable>
    </View>
  );
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
});

export default ErrorBoundary;
