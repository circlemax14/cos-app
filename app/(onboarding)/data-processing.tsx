import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { apiClient } from '@/lib/api-client';
import { signOut } from '@/services/auth';
import { confirmAndDeleteAccount } from '@/services/account-deletion';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

const POLL_INTERVAL_MS = 10_000; // Check every 10 seconds

interface FastenStatusResponse {
  success: boolean;
  data: {
    connected: boolean;
    dataReady: boolean;
    ehiExportPending: boolean;
    ehiExportFailed: boolean;
  };
}

/**
 * Data Processing Screen
 *
 * Shown after the Fasten Health connection + Bulk Records Request is initiated.
 * Displays a waiting message with no header or navigation.
 * Polls the backend for data readiness and navigates to permissions when ready.
 * Shows a retry button if the export failed or timed out.
 */
export default function DataProcessingScreen() {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  /*
   * APPLE-02 — the onboarding gate sends every connected-but-not-ready patient
   * here on every cold launch, and a failed export can stay failed. Without
   * these two buttons that patient can neither sign out nor reach Profile's
   * deletion (Apple 5.1.1(v), Google Play account deletion).
   */
  const [deleting, setDeleting] = useState(false);

  const handleSignOut = useCallback(async () => {
    await signOut();
    router.replace('/(auth)/sign-in' as never);
  }, []);

  const navigateToHome = useCallback(async () => {
    // Route through the splash gate so the one-time welcome screen gets a
    // chance to run before Home (new users AND existing users who haven't
    // seen it yet).
    router.replace('/' as never);
  }, []);

  const checkDataReady = useCallback(async () => {
    try {
      const res = await apiClient.get<FastenStatusResponse>('/v1/fasten/status');
      const { dataReady, ehiExportFailed } = res.data.data;

      if (dataReady) {
        // Data is ready — stop polling and navigate to Home
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        await navigateToHome();
        return;
      }

      if (ehiExportFailed) {
        // Export failed — stop polling and show retry UI
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        setFailed(true);
      }
    } catch {
      // Silently retry on next interval — network errors are transient
    }
  }, [navigateToHome]);

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    setFailed(false);
    try {
      await apiClient.post('/v1/fasten/retry-export');
      // Restart polling after successful retry
      pollingRef.current = setInterval(checkDataReady, POLL_INTERVAL_MS);
      checkDataReady();
    } catch {
      setFailed(true);
    } finally {
      setRetrying(false);
    }
  }, [checkDataReady]);

  useEffect(() => {
    // Start polling for data readiness
    pollingRef.current = setInterval(checkDataReady, POLL_INTERVAL_MS);

    // Also check immediately on mount
    checkDataReady();

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [checkDataReady]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Image
          source={require('@/assets/images/logo.png')}
          style={{ width: getScaledFontSize(160), height: getScaledFontSize(100) }}
          contentFit="contain"
        />

        {!failed && (
          <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
        )}

        <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(22), flexShrink: 1 }]}>
          {failed ? 'Unable to Process Health Data' : 'Processing Your Health Data'}
        </Text>

        {failed ? (
          <>
            <Text style={[styles.body, { color: colors.subtext, fontSize: getScaledFontSize(15), flexShrink: 1 }]}>
              We encountered an issue while retrieving your medical records. This can happen with large data sets.
              Please try again.
            </Text>

            <Pressable
              onPress={handleRetry}
              disabled={retrying}
              style={[styles.retryButton, { backgroundColor: retrying ? '#9ca3af' : '#2563eb' }]}
              accessibilityLabel="Retry health data export"
              accessibilityRole="button"
            >
              {retrying ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={[styles.retryText, { fontSize: getScaledFontSize(16) }]}>
                  Retry
                </Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.body, { color: colors.subtext, fontSize: getScaledFontSize(15), flexShrink: 1 }]}>
              We are securely retrieving and processing your medical records. This may take a few minutes.
            </Text>

            <Text style={[styles.body, { color: colors.subtext, fontSize: getScaledFontSize(15), flexShrink: 1 }]}>
              We will notify you once your data is ready. You can safely close the app in the meantime.
            </Text>
          </>
        )}

        <Pressable
          onPress={handleSignOut}
          style={styles.textButton}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: '600' }}>
            Sign Out
          </Text>
        </Pressable>

        <Pressable
          onPress={() => { if (!deleting) confirmAndDeleteAccount(setDeleting); }}
          disabled={deleting}
          style={styles.textButton}
          accessibilityRole="button"
          accessibilityLabel="Delete my account"
          accessibilityState={{ disabled: deleting, busy: deleting }}
        >
          {deleting ? (
            <ActivityIndicator size="small" color="#DC2626" />
          ) : (
            <Text style={{ color: '#DC2626', fontSize: getScaledFontSize(13), fontWeight: '500' }}>
              Delete my account
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 40,
  },
  spinner: {
    marginTop: 24,
  },
  title: {
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 8,
  },
  body: {
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  retryText: {
    color: 'white',
    fontWeight: '600',
  },
  textButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
