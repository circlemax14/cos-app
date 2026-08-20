import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { useQueryClient } from '@tanstack/react-query';

import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { initializeHealthKit, isHealthKitAvailable } from '@/services/health';
import {
  getAppleHealthEnabled,
  setAppleHealthEnabled,
} from '@/services/apple-health-preference';
import { APPLE_HEALTH_PREFERENCE_KEY } from '@/hooks/use-apple-health-preference';

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

/**
 * Apple Health connection screen (COS-389 / SCRUM-530).
 *
 * Ken's feedback: the HealthKit permission prompt was firing accidentally on
 * mount of the Personal Information screen. It now lives here as a deliberate,
 * easy-to-find opt-in control reached from the profile drawer → "Apple Health".
 *
 * iOS only. On Android (or any device without HealthKit) we show a graceful
 * "not available on this device" state and never call into HealthKit.
 *
 * Connection state is a locally persisted hint of the user's choice — iOS does
 * not reliably expose prior read-permission status. The actual data path
 * (daily health summary / useHealthKitTrends) is unchanged; we only moved
 * WHERE the permission is requested.
 */
export default function AppleHealthScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const queryClient = useQueryClient();

  const available = isHealthKitAvailable();

  // COS-397 / SCRUM-535: after the user changes their Apple Health choice,
  // invalidate the reactive preference query + the HealthKit trends so every
  // surface (Health Trends) reflects the new state without a manual refresh.
  const invalidateAppleHealth = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: APPLE_HEALTH_PREFERENCE_KEY });
    void queryClient.invalidateQueries({ queryKey: ['healthkit-trends'] });
  }, [queryClient]);

  const [enabled, setEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Hydrate the toggle from the user's last recorded choice so it reflects
  // their decision when they come back to this screen.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await getAppleHealthEnabled();
      if (!cancelled) {
        setEnabled(stored);
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = useCallback(
    async (next: boolean) => {
      if (!available) return;

      if (!next) {
        // The user is opting out. iOS doesn't let an app revoke its own
        // HealthKit access — that lives in Settings > Privacy & Security >
        // Health. All we can honestly do is forget the local "enabled" hint
        // so the daily summary stops being presented as connected.
        setEnabled(false);
        await setAppleHealthEnabled(false);
        invalidateAppleHealth();
        setStatusMessage({
          text:
            'Apple Health turned off. To fully revoke access, open Settings > Privacy & Security > Health.',
          isError: false,
        });
        return;
      }

      // Opting in — request HealthKit read permissions. This is the single,
      // deliberate place the iOS permission dialog is triggered.
      setIsConnecting(true);
      setStatusMessage(null);
      try {
        const granted = await initializeHealthKit();
        setEnabled(granted);
        await setAppleHealthEnabled(granted);
        invalidateAppleHealth();
        setStatusMessage(
          granted
            ? { text: 'Apple Health connected. Your daily summary will use Health data.', isError: false }
            : { text: 'Apple Health access was not granted.', isError: true },
        );
      } catch (err) {
        setEnabled(false);
        await setAppleHealthEnabled(false);
        invalidateAppleHealth();
        const message =
          err instanceof Error
            ? err.message
            : 'Could not connect to Apple Health. Please try again.';
        setStatusMessage({ text: message, isError: true });
      } finally {
        setIsConnecting(false);
      }
    },
    [available, invalidateAppleHealth],
  );

  return (
    <AppWrapper>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.headerSection}>
          <Text style={styles.emoji}>❤️</Text>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(22),
              fontWeight: getScaledFontWeight(700) as any,
              textAlign: 'center',
              marginBottom: 4,
            }}
            accessibilityRole="header"
          >
            Apple Health
          </Text>
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(14),
              textAlign: 'center',
            }}
          >
            Connect Apple Health to enrich your daily summary and health trends
            with steps, heart rate, sleep, and more from your iPhone and Apple
            Watch.
          </Text>
        </View>

        {!available ? (
          /* Graceful "not available on this device" state */
          <View style={styles.section}>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.row, { borderBottomWidth: 0 }]}>
                <View style={styles.rowLeft}>
                  <Text style={{ color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }}>
                    Not available on this device
                  </Text>
                  <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginTop: 2 }}>
                    {Platform.OS === 'ios'
                      ? 'Apple Health is unavailable. Make sure the Health app is installed and try again.'
                      : 'Apple Health is only available on iPhone.'}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(13),
                fontWeight: getScaledFontWeight(600) as any,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 12,
                marginLeft: 4,
              }}
            >
              Connection
            </Text>

            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.row, { borderBottomWidth: 0 }]}>
                <View style={styles.rowLeft}>
                  <Text style={{ color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }}>
                    Enable Apple Health
                  </Text>
                  <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginTop: 2 }}>
                    {enabled ? 'Connected' : 'Not connected'}
                  </Text>
                </View>
                {isLoading || isConnecting ? (
                  <ActivityIndicator size="small" color={colors.tint} />
                ) : (
                  <Switch
                    value={enabled}
                    onValueChange={handleToggle}
                    trackColor={{ false: '#E0E0E0', true: colors.tint }}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: enabled }}
                    accessibilityLabel="Enable Apple Health"
                  />
                )}
              </View>
            </View>

            {statusMessage ? (
              <Text
                style={{
                  color: statusMessage.isError ? '#DC2626' : '#059669',
                  fontSize: getScaledFontSize(13),
                  marginTop: 12,
                  marginLeft: 4,
                }}
                accessibilityRole="alert"
              >
                {statusMessage.text}
              </Text>
            ) : null}

            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(12),
                marginTop: 16,
                marginLeft: 4,
                lineHeight: getScaledFontSize(18),
              }}
            >
              We only read health data — we never write to Apple Health. You can
              change or revoke access at any time in Settings &gt; Privacy &amp;
              Security &gt; Health.
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  section: {
    marginBottom: 24,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: 54,
  },
  rowLeft: {
    flex: 1,
    marginRight: 12,
  },
});
