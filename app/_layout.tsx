import * as Sentry from '@sentry/react-native';

// Initialize Sentry as early as possible — before any other imports run side
// effects — so we capture errors thrown during module load + provider setup.
// The DSN is public (that's how Sentry's threat model works); the secret is
// the auth token, which is only used at build time for source-map upload.
Sentry.init({
  dsn: 'https://e355f7946736032baf6d1b47c7dec51c@o4511341366345728.ingest.us.sentry.io/4511341368115200',
  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 0.1,
  // Capture warnings + errors
  enableNativeCrashHandling: true,
  enableAutoSessionTracking: true,
  // Tag every event with the runtime info we already track in About so we
  // can filter by build / OTA group when triaging
  // (more tags added in app/index.tsx after the JS bundle finishes loading)
});

// SCRUM-181 diagnostic: emit a boot log so we can verify console.log reaches
// the iOS device console at all. If the user sees this line in Console.app
// (filter "CSH-JS-BOOT") but no later [CSH-JS-ERROR], the issue is the error
// handler not being called — not the logging mechanism. Cheap sanity check.
console.log(`[CSH-JS-BOOT] diagnostic loaded at ${new Date().toISOString()}`);

// Also intercept the global ExceptionsManager native module — RN's JS
// runtime calls ExceptionsManager.reportException directly (bypassing
// ErrorUtils.setGlobalHandler in some code paths). Wrapping it here means
// any error reported to the native side gets logged first.
try {
  const NativeModules = require('react-native').NativeModules;
  const orig = NativeModules?.ExceptionsManager?.reportException;
  if (NativeModules?.ExceptionsManager && typeof orig === 'function') {
    NativeModules.ExceptionsManager.reportException = function (data: unknown) {
      try {
        const d = data as { message?: string; stack?: unknown; isFatal?: boolean };
        const msg = d?.message ?? '<no message>';
        const isFatal = !!d?.isFatal;
        const stackStr = JSON.stringify(d?.stack ?? '<no stack>').slice(0, 4000);
        console.log(`[CSH-JS-NATIVE] fatal=${isFatal} ${msg} stack=${stackStr}`);
      } catch {
        // swallow
      }
      // Do NOT forward to the native method — it's the broken path on iOS 26.
      // We've already logged the error, so silently swallow further reporting.
    };
  }
} catch {
  // swallow
}

// SCRUM-181 diagnostic: wrap the global JS error handler to log the underlying
// JS error to NSLog (visible in Console.app filtered by "CSH-JS") BEFORE the
// React Native dispatches it to RCTExceptionsManager.reportException. On
// iOS 26 that native reporter itself crashes (NSException →
// CPPExceptionTerminate → abort), wiping out our chance to see what failed.
//
// We deliberately use console.log (not console.error). In RN production,
// console.error routes through the global error handler → the very same
// RCTExceptionsManager path that's broken. console.log goes through
// __turboModuleProxy → RCTLog → NSLog and survives the crash.
//
// We also do NOT chain to the original handler — chaining would re-enter
// the broken path. The original handler still runs for errors not caught
// by our wrapper (we only catch what ErrorUtils.setGlobalHandler routes).
(global as any).ErrorUtils?.setGlobalHandler?.((error: unknown, isFatal?: boolean) => {
  try {
    const err = error as Error & { message?: string; stack?: string };
    const message = err?.message ?? String(error);
    const stack = err?.stack ?? '<no stack>';
    // console.log → NSLog → Console.app. Grep "CSH-JS-ERROR" to find it.
    console.log(`[CSH-JS-ERROR] fatal=${!!isFatal} ${message}\n${stack}`);
  } catch {
    // never let the error handler itself throw
  }
  // Do NOT call the original handler — it leads to RCTExceptionsManager
  // which crashes on iOS 26. Sentry still gets the event via its own
  // beforeSend hook installed during Sentry.init above.
});

// Also capture unhandled Promise rejections via Hermes' tracker.
const __processHpr = (global as any).HermesInternal?.hasPromise?.()
  ? (global as any).HermesInternal
  : null;
if (__processHpr) {
  (__processHpr as any).enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (id: number, reason: unknown) => {
      try {
        const err = reason as Error & { message?: string; stack?: string };
        const message = err?.message ?? String(reason);
        const stack = err?.stack ?? '<no stack>';
        console.log(`[CSH-JS-REJECT] id=${id} ${message}\n${stack}`);
      } catch {
        // swallow
      }
    },
  });
}

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { PaperProvider } from 'react-native-paper';
import { View } from 'react-native';
import 'react-native-reanimated';
import { rootIdleActivityHandlers } from '@/hooks/use-app-lock';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNotifications } from '@/hooks/use-notifications';
import { AccessibilityProvider } from '@/stores/accessibility-store';
import { SecurityProvider } from '@/stores/security-store';
import { ProviderSelectionProvider } from '@/stores/provider-selection-store';
import { QueryProvider } from '@/providers/QueryProvider';
import { SettingsProvider } from '@/stores/settings-store';
import { UserPhotoProvider } from '@/stores/user-photo-store';

// Hold the native splash up as early as possible — at module load,
// before any layout mount — so there is no flash of blank white
// screen between the OS splash dismissing and our JS splash
// rendering. app/index.tsx (SplashGate) is responsible for hiding it
// once the session check completes.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Suppress console output in production to avoid leaking PHI into device logs.
if (!__DEV__) {
  console.log = () => {};
  console.warn = () => {};
  console.debug = () => {};
  // Keep console.error for crash reporting tools that may hook into it
}

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayout() {
  const colorScheme = useColorScheme();
  useNotifications();

  // Capture every touch at the root so the idle-lock timer (15 min) is
  // reset whenever the user actually interacts with the app. The
  // PanResponder sits at the capture phase and returns false from both
  // onStartShouldSetPanResponderCapture / onMoveShouldSetPanResponderCapture
  // so it never consumes the gesture — it only observes it.
  const idleHandlers = rootIdleActivityHandlers().panHandlers;

  return (
    <QueryProvider>
      <AccessibilityProvider>
        <SecurityProvider>
        <ProviderSelectionProvider>
          <SettingsProvider>
            <UserPhotoProvider>
            <PaperProvider>
              <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
                <View style={{ flex: 1 }} {...idleHandlers}>
                <Stack>
                  <Stack.Screen name="index" options={{ headerShown: false }} />
                  <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                  <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
                  <Stack.Screen name="(security)" options={{ headerShown: false }} />
                  <Stack.Screen name="Home" options={{ headerShown: false }} />
                  <Stack.Screen name="(personal-info)" options={{ headerShown: false }} />
                  <Stack.Screen name="(care-manager-detail)" options={{ headerShown: false }} />
                  <Stack.Screen name="(doctor-detail)" options={{ headerShown: false }} />
                  <Stack.Screen
                    name="modal"
                    options={{
                      presentation: 'modal',
                      title: 'Doctors',
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="agency-detail"
                    options={{
                      presentation: 'modal',
                      title: 'Agency Details',
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="appointments-modal"
                    options={{
                      presentation: 'modal',
                      title: 'All Appointments',
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="today-schedule"
                    options={{
                      title: "Today's Schedule",
                      headerShown: false,
                      autoHideHomeIndicator: true,
                    }}
                  />
                </Stack>
                <StatusBar style="auto" />
                </View>
              </ThemeProvider>
            </PaperProvider>
            </UserPhotoProvider>
          </SettingsProvider>
        </ProviderSelectionProvider>
        </SecurityProvider>
      </AccessibilityProvider>
    </QueryProvider>
  );
}

// Sentry.wrap installs the JS error boundary + perf instrumentation around
// the root component. Any uncaught error inside the React tree now lands
// in Sentry with full stack + component breadcrumbs.
export default Sentry.wrap(RootLayout);
