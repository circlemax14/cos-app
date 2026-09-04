import * as Sentry from '@sentry/react-native';
import { initSentry } from '@/lib/sentry-install';

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as ScreenCapture from 'expo-screen-capture';
import { PaperProvider } from 'react-native-paper';
import { BadgeCelebrationProvider } from '@/components/celebrations/BadgeCelebrationProvider';
import { useEffect } from 'react';
import { View } from 'react-native';
import 'react-native-reanimated';
import { rootIdleActivityHandlers, useAppLock } from '@/hooks/use-app-lock';
import { useGlobalCalendarSync } from '@/hooks/use-global-calendar-sync';
// SCRUM-628 P6 — entitlements-changed WSS sync + long-poll fallback. Renders
// nothing; wires the WSS lifecycle to auth + AppState. Flag-gated inside the
// hook on EXPO_PUBLIC_ENTITLEMENTS_SYNC_ENABLED — default OFF so this ships
// dark and inert until Ken flips the env var + cuts a new bundle.
import { useEntitlementsSync } from '@/hooks/use-entitlements-sync';
import { useTimezoneSync } from '@/hooks/use-timezone-sync';
// ADR-0004 P1 — health-data-changed WSS sync + long-poll fallback. Mirrors
// the entitlements-sync contract for lab/vaccine/summary/plan invalidation.
// Renders nothing; flag-gated inside the hook on
// EXPO_PUBLIC_LABS_REALTIME_ENABLED — default OFF, ships dark until Ken
// flips the env var + cuts a new bundle. Runs alongside useEntitlementsSync
// with an independent WebSocket lifecycle (see hook header for rationale).
import { useHealthDataSync } from '@/hooks/use-health-data-sync';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNotifications } from '@/hooks/use-notifications';
import { AccessibilityProvider } from '@/stores/accessibility-store';
import { SecurityProvider } from '@/stores/security-store';
import { ProviderSelectionProvider } from '@/stores/provider-selection-store';
import { QueryProvider } from '@/providers/QueryProvider';
// SCRUM-651 — bridges the shared `useFeatureFlags` query to module-
// level caches consumed by non-hook code paths (today: labs-realtime).
// Renders nothing; MUST live inside <QueryProvider> so the hook has
// a QueryClient in context.
import { FeatureFlagBridge } from '@/components/FeatureFlagBridge';
import { SettingsProvider } from '@/stores/settings-store';
import { UserPhotoProvider } from '@/stores/user-photo-store';
import { installRedactedConsoleError } from '@/lib/redact-error-logs';
import { shouldPreventScreenCapture } from '@/lib/screenshot-policy';

// Initialize Sentry as early as possible — before any other imports run side
// effects — so we capture errors thrown during module load + provider setup.
//
// initSentry wires the HIPAA-safety contract (SCRUM-364 / PHI-LOGGING-003):
// beforeSend strips PHI from event request / user / transaction / extra /
// contexts / breadcrumb tail; beforeBreadcrumb strips request bodies from
// PHI-bearing fetch/xhr breadcrumbs; and mobileReplayIntegration is
// registered with mask-all-text/images/vectors pinned ON so flipping
// replay sampling later doesn't need a fresh review.
//
// Config lives in lib/sentry-config.ts (pure, contract-tested). The
// Sentry-touching adapter is lib/sentry-install.ts. The DSN is public
// (Sentry's threat model); the secret is the build-time auth token.
initSentry(
  'https://e355f7946736032baf6d1b47c7dec51c@o4511341366345728.ingest.us.sentry.io/4511341368115200',
);

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

  // console.error is kept (some crash-reporting tooling hooks into it)
  // but wrapped to redact PHI from Error / axios-shaped arguments before
  // logging. Security audit COS-331. Implementation in lib/redact-error-logs.
  installRedactedConsoleError();
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
  // SCRUM-279 (build 46): app-wide calendar snapshot sync — runs on
  // first mount + every foreground transition, throttled to once per
  // 5 minutes. Backs up the 15-min BackgroundFetch task with an
  // active-use safety net so the DB is always fresh.
  useGlobalCalendarSync();
  // SCRUM-628 P6: entitlements-changed WSS sync + long-poll fallback.
  // Runs iff EXPO_PUBLIC_ENTITLEMENTS_SYNC_ENABLED='true' AND a session
  // exists. Pure passthrough otherwise.
  useEntitlementsSync();
  /*
   * COS-871 — send the device's IANA timezone so reminders arrive in the
   * patient's own morning. The per-user-TZ sweeper (SCRUM-256/259) has been
   * deployed all along; nothing ever set the field, so every user fell back to
   * the three fixed UTC crons and a US patient got a 4am "morning" reminder.
   */
  useTimezoneSync();
  // ADR-0004 P1: health-data-changed WSS sync + long-poll fallback.
  // Runs iff EXPO_PUBLIC_LABS_REALTIME_ENABLED='true' AND a session
  // exists. Pure passthrough otherwise. Independent WebSocket lifecycle
  // from useEntitlementsSync so each hook flag-gates + backs off on its
  // own — a bad labs push can't stall entitlements sync and vice-versa.
  useHealthDataSync();
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
      {/* COS-778 — gestureEnabled:false is NOT cosmetic here.
          `router.replace` leaves the previous root-level screen mounted
          underneath the lock screen, and nothing in this repo set
          gestureEnabled. headerShown:false does NOT disable the iOS
          left-edge swipe-back, so the gesture walked straight back onto
          live PHI (bypass #1, SCRUM-721). This closes the gesture; the
          shield and dismissAll close the rest. */}
      <Stack.Screen
        name="(security)"
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen name="Home" options={{ headerShown: false }} />
      {/* Ken 2026-08-07 (#19) — (personal-info) route group removed.
          The screen moved INTO the Tabs navigator at
          app/Home/personal-info.tsx so it renders with the bottom tab
          bar and the AppWrapper header. A root-level Stack sibling of
          Home structurally cannot show the tab bar. */}
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
          // formSheet presentation had inconsistent safe-area + status-
          // bar overlap across iPad / iPhone / orientation, leaving
          // Cancel/Add hidden behind iOS chrome (Ken reported this
          // twice). Reverted to fullScreenModal — predictable safe-area
          // on all surfaces, header always visible. Loses the sheet
          // grabber but the explicit "Cancel" button covers dismissal.
          presentation: 'fullScreenModal',
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

  // SCRUM-368 (MOBILE-003): Block screenshots and screen-recording app-wide.
  // PHI is rendered on virtually every authenticated screen (patient detail,
  // health summary, assessments, calendar events), so we apply the flag
  // globally rather than per-screen. On Android this sets FLAG_SECURE on the
  // window — which ALSO hides the app preview from the recent-apps switcher.
  // On iOS this listens to UIScreen.capturedDidChangeNotification and blanks
  // the screen during recording; iOS app-switcher snapshot redaction is a
  // separate concern (see NOTES — may require a native AppDelegate shim).
  //
  // COS-401 / SCRUM-537: the block is now gated on SCREENSHOTS_BLOCKED
  // (lib/screenshot-policy.ts), default true (secure). This is an OTA-safe JS
  // toggle: flipping the flag to false makes us call allowScreenCaptureAsync()
  // instead, so testers can capture screenshots without a native rebuild.
  //
  // HIPAA / PHI SAFEGUARD: flipping SCREENSHOTS_BLOCKED off disables a PHI
  // safeguard for ALL users on that build/OTA — intended ONLY as a temporary,
  // deliberate testing toggle. Flip back to true (and OTA) before real users
  // see PHI on that build.
  useEffect(() => {
    if (shouldPreventScreenCapture()) {
      ScreenCapture.preventScreenCaptureAsync().catch(() => {
        // Non-fatal — log loss of capture protection but don't crash the app.
      });
    } else {
      // Testing toggle is OFF-secure: actively re-allow capture in case a prior
      // run/instance had prevention enabled. OTA-safe expo-screen-capture path.
      ScreenCapture.allowScreenCaptureAsync().catch(() => {
        // Non-fatal.
      });
    }
  }, []);

  // Capture every touch at the root so the idle-lock timer (15 min) is
  // reset whenever the user actually interacts with the app. The
  // PanResponder sits at the capture phase and returns false from both
  // onStartShouldSetPanResponderCapture / onMoveShouldSetPanResponderCapture
  // so it never consumes the gesture — it only observes it.
  const idleHandlers = rootIdleActivityHandlers().panHandlers;

  return (
    <QueryProvider>
      <FeatureFlagBridge />
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

// Sentry.wrap adds perf instrumentation and touch breadcrumbs around the root
// component. It does NOT install an error boundary.
//
// CORRECTED COS-723 (2026-08-19). This comment previously read "Sentry.wrap
// installs the JS error boundary ... Any uncaught error inside the React tree
// now lands in Sentry". That is false, and believing it is why 74 of 79 routes
// sat with no boundary at all. Sentry.wrap renders exactly:
//
//     TouchEventBoundary > ReactNativeProfiler > FeedbackWidgetProvider
//
// (@sentry/react-native/dist/js/sdk.js, `wrap`) and NONE of the three
// implements componentDidCatch or getDerivedStateFromError — checked against
// the SDK source, not the docs. "TouchEventBoundary" is about touch
// BREADCRUMBS; it catches nothing.
//
// An uncaught render error therefore propagates to the root and expo-updates'
// error recovery aborts the process — which is precisely what happened on
// 2026-08-15 (Health Summary). Catching is done per-route: each route exports
// `ErrorBoundary` from components/RouteErrorBoundary.tsx, which expo-router
// wraps in its `Try` class boundary.
export default Sentry.wrap(RootLayout);
