import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNotifications } from '@/hooks/use-notifications';
import { AccessibilityProvider } from '@/stores/accessibility-store';
import { SecurityProvider } from '@/stores/security-store';
import { ProviderSelectionProvider } from '@/stores/provider-selection-store';
import { QueryProvider } from '@/providers/QueryProvider';
import { SettingsProvider } from '@/stores/settings-store';

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

export default function RootLayout() {
  const colorScheme = useColorScheme();
  useNotifications();

  return (
    <QueryProvider>
      <AccessibilityProvider>
        <SecurityProvider>
        <ProviderSelectionProvider>
          <SettingsProvider>
            <PaperProvider>
              <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
                {/* ... Stack and other children ... */}
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
              </ThemeProvider>
            </PaperProvider>
          </SettingsProvider>
        </ProviderSelectionProvider>
        </SecurityProvider>
      </AccessibilityProvider>
    </QueryProvider>
  );
}
