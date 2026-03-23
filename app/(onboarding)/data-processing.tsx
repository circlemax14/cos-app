import { Image } from 'expo-image';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

import { apiClient } from '@/lib/api-client';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

const POLL_INTERVAL_MS = 10_000; // Check every 10 seconds

/**
 * Data Processing Screen
 *
 * Shown after the Fasten Health connection + Bulk Records Request is initiated.
 * Displays a waiting message with no header or navigation.
 * Polls the backend for data readiness and navigates to permissions when ready.
 */
export default function DataProcessingScreen() {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const requestPermissionsAndNavigate = useCallback(async () => {
    try {
      // Request notification permissions silently
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === 'granted') {
        try {
          const tokenData = await Notifications.getExpoPushTokenAsync();
          await apiClient.post('/v1/notifications/register-token', {
            token: tokenData.data,
            platform: Platform.OS === 'ios' ? 'ios' : 'android',
          });
        } catch {
          // Non-critical — registration failure doesn't block navigation
        }
      }
    } catch {
      // Non-critical — permission request failure doesn't block navigation
    }
    // Navigate to Home regardless of permission status
    router.replace('/Home' as never);
  }, []);

  const checkDataReady = useCallback(async () => {
    try {
      const res = await apiClient.get<{
        success: boolean;
        data: { connected: boolean; dataReady: boolean; ehiExportPending: boolean };
      }>('/v1/fasten/status');

      if (res.data.data.dataReady) {
        // Data is ready — stop polling and request permissions before navigating to Home
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        await requestPermissionsAndNavigate();
      }
    } catch {
      // Silently retry on next interval — network errors are transient
    }
  }, [requestPermissionsAndNavigate]);

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
      <Image
        source={require('@/assets/images/logo.png')}
        style={{ width: getScaledFontSize(100), height: getScaledFontSize(100) }}
        contentFit="contain"
      />

      <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />

      <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(22) }]}>
        Processing Your Health Data
      </Text>

      <Text style={[styles.body, { color: colors.subtext, fontSize: getScaledFontSize(15) }]}>
        We are securely retrieving and processing your medical records. This may take a few minutes.
      </Text>

      <Text style={[styles.body, { color: colors.subtext, fontSize: getScaledFontSize(15) }]}>
        We will notify you once your data is ready. You can safely close the app in the meantime.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 16,
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
    lineHeight: 22,
  },
});
