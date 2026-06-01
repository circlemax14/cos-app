import * as Sentry from '@sentry/react-native';

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { PaperProvider } from 'react-native-paper';
import { BadgeCelebrationProvider } from '@/components/celebrations/BadgeCelebrationProvider';
import { View } from 'react-native';
import 'react-native-reanimated';
import { rootIdleActivityHandlers, useAppLock } from '@/hooks/use-app-lock';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNotifications } from '@/hooks/use-notifications';
import { AccessibilityProvider } from '@/stores/accessibility-store';
import { SecurityProvider } from '@/stores/security-store';
import { ProviderSelectionProvider } from '@/stores/provider-selection-store';
import { QueryProvider } from '@/providers/QueryProvider';
import { SettingsProvider } from '@/stores/settings-store';
import { UserPhotoProvider } from '@/stores/user-photo-store';

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

/**
 * Inner stack — runs INSIDE <SecurityProvider> so useAppLock can read
 * the security context. Previously useAppLock was called from
 * app/index.tsx (the splash gate) which unmounted as soon as the user
 * navigated past `/`, killing the AppState subscription that locks the
 * app on background→foreground. Hoisted to the root layout (SCRUM-235)
 * so it stays mounted for the lifetime of the app process.
 */
function StackWithAppLock() {
  useAppLock();
  return (
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
      <Stack.Screen
        name="calendar-event-editor"
        options={{
          // K5: Apple uses a half-sheet (formSheet on iOS 15+) for
          // the New Event flow — the user can dismiss with a downward
          // swipe. formSheet falls back gracefully on Android.
          presentation: 'formSheet',
          sheetAllowedDetents: [0.6, 1.0],
          sheetGrabberVisible: true,
          title: 'New Event',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="calendar-event-detail"
        options={{
          // Apple-style: dimmed underlying screen visible through the popover
          presentation: 'transparentModal',
          animation: 'fade',
          title: 'Event Detail',
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
    </Stack>
  );
}

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
                <BadgeCelebrationProvider>
                <View style={{ flex: 1 }} {...idleHandlers}>
                <StackWithAppLock />
                <StatusBar style="auto" />
                </View>
                </BadgeCelebrationProvider>
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
