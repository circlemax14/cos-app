import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AccessibilityProvider } from '@/stores/accessibility-store';
import { ProviderSelectionProvider } from '@/stores/provider-selection-store';
import { DatabaseProvider } from '@/database/DatabaseProvider';
import { QueryProvider } from '@/providers/QueryProvider';
import { SettingsProvider } from '@/stores/settings-store';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <QueryProvider>
      <DatabaseProvider>
        <AccessibilityProvider>
          <ProviderSelectionProvider>
            <SettingsProvider>
              <PaperProvider>
                <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
                  {/* ... Stack and other children ... */}
                  <Stack>
                    <Stack.Screen name="index" options={{ headerShown: false }} />
                    <Stack.Screen name="(auth)" options={{ headerShown: false }} />
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
        </AccessibilityProvider>
      </DatabaseProvider>
    </QueryProvider>
  );
}
