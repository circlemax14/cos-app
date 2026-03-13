import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { apiClient } from '@/lib/api-client';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

type ScreenState = 'idle' | 'initiating' | 'syncing' | 'error';

export default function FastenConnectScreen() {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [state, setState] = useState<ScreenState>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setState('initiating');
    setError(null);

    try {
      // 1. Get Fasten Health connection URL from backend
      const initiateRes = await apiClient.post<{
        success: boolean;
        data: { connectionUrl: string; sessionToken: string };
      }>('/v1/fasten/initiate', { redirectScheme: 'cosapp' });

      const { connectionUrl } = initiateRes.data.data;

      // 2. Open Fasten Health WebView for user to authenticate their EHR
      const result = await WebBrowser.openAuthSessionAsync(connectionUrl, 'cosapp://fasten-callback');

      if (result.type !== 'success') {
        // User cancelled or browser closed without completing
        setState('idle');
        return;
      }

      // 3. Parse the callback URL to get Fasten result
      setState('syncing');
      const callbackUrl = result.url;
      const params = new URLSearchParams(callbackUrl.split('?')[1] ?? '');
      const fastenPatientId = params.get('patientId') ?? params.get('fastenPatientId') ?? 'unknown';
      const jobId = params.get('jobId') ?? undefined;
      const status = params.get('status') === 'failed' ? 'failed' : 'connected';

      // 4. Report back to backend
      await apiClient.post('/v1/fasten/callback', {
        fastenPatientId,
        jobId,
        status,
      });

      // 5. Move to permissions screen
      router.replace('/(onboarding)/permissions' as never);
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Connection failed. Please try again.');
    }
  };

  const handleSkip = async () => {
    // Allow skipping — user can connect later from their profile
    router.replace('/(onboarding)/permissions' as never);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {/* Icon */}
        <Text style={styles.icon}>🏥</Text>

        {/* Title */}
        <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(24) }]}>
          Connect Your Health Records
        </Text>

        {/* Subtitle */}
        <Text style={[styles.subtitle, { color: colors.subtext, fontSize: getScaledFontSize(15) }]}>
          Securely sync your medical records from your healthcare providers using Fasten Health.
          This is needed to access your health data in the app.
        </Text>

        {/* Features list */}
        {[
          '✓ Sync from thousands of providers',
          '✓ Your data stays private and secure',
          '✓ One-time setup, always up to date',
        ].map((item) => (
          <Text key={item} style={[styles.feature, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
            {item}
          </Text>
        ))}

        {/* Error */}
        {error && (
          <View style={[styles.errorBox, { backgroundColor: '#FDECEA' }]}>
            <Text style={[styles.errorText, { fontSize: getScaledFontSize(14) }]}>{error}</Text>
          </View>
        )}
      </View>

      {/* Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          onPress={handleConnect}
          disabled={state === 'initiating' || state === 'syncing'}
          accessibilityLabel="Connect with Fasten Health"
          accessibilityRole="button"
          accessibilityState={{ disabled: state === 'initiating' || state === 'syncing', busy: state === 'initiating' || state === 'syncing' }}
        >
          {state === 'initiating' || state === 'syncing' ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#fff" />
              <Text style={[styles.primaryButtonText, { fontSize: getScaledFontSize(16) }]}>
                {state === 'initiating' ? 'Connecting…' : 'Syncing data…'}
              </Text>
            </View>
          ) : (
            <Text style={[styles.primaryButtonText, { fontSize: getScaledFontSize(16) }]}>
              Connect with Fasten Health
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSkip}
          disabled={state === 'syncing'}
          accessibilityLabel="Skip health records connection for now"
          accessibilityRole="button"
        >
          <Text style={[styles.skipText, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
            Skip for now
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  icon: { fontSize: 72 },
  title: { fontWeight: '700', textAlign: 'center' },
  subtitle: { textAlign: 'center', lineHeight: 22, opacity: 0.8 },
  feature: { alignSelf: 'flex-start', lineHeight: 24 },
  errorBox: { padding: 12, borderRadius: 8, width: '100%' },
  errorText: { color: '#C62828' },
  actions: { paddingBottom: 40, gap: 16, alignItems: 'center' },
  primaryButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontWeight: '700' },
  loadingRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  skipText: { textDecorationLine: 'underline' },
});
