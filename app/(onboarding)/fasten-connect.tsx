import { FastenStitchElement } from '@fastenhealth/fasten-stitch-element-react-native';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiClient } from '@/lib/api-client';
import { signOut } from '@/services/auth';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useFeaturePermissions } from '@/hooks/use-feature-permissions';

const FASTEN_PUBLIC_ID = process.env.EXPO_PUBLIC_FASTEN_PUBLIC_ID ?? '';

export default function FastenConnectScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const navigating = useRef(false);
  const [connectedCount, setConnectedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWidget, setShowWidget] = useState(true);
  const [widgetDismissed, setWidgetDismissed] = useState(false);

  // Guard: if the reviewer / any user has CONNECT_CLINIC disabled by an
  // admin, never show the Fasten widget. 4 separate routes can land here
  // (sign-in, index, permissions, terms) so we check at the destination,
  // not at every source. Wait for permissions to load before deciding —
  // default-true would flash the widget to a disabled user.
  const { data: permissions, isLoading: permissionsLoading } = useFeaturePermissions();
  const connectClinicDisabled =
    permissions !== undefined && permissions.CONNECT_CLINIC?.enabled === false;

  useEffect(() => {
    if (connectClinicDisabled && !navigating.current) {
      navigating.current = true;
      router.replace('/Home' as never);
    }
  }, [connectClinicDisabled]);

  const handleEvent = useCallback(async (event: unknown) => {
    let parsed: { event_type?: string; api_mode?: string; data?: Record<string, unknown> } | null = null;

    if (event && typeof event === 'object') {
      const raw = event as Record<string, unknown>;
      if (typeof raw.payload === 'string') {
        try {
          parsed = JSON.parse(raw.payload);
        } catch {
          return;
        }
      } else if (raw.event_type) {
        parsed = raw as { event_type?: string; api_mode?: string; data?: Record<string, unknown> };
      }
    }

    if (!parsed?.event_type) return;

    const eventType = parsed.event_type;

    if (eventType === 'patient.connection_success') {
      setError(null);
      try {
        await apiClient.post('/v1/fasten/connection', {
          api_mode: parsed.api_mode ?? 'test',
          event_type: eventType,
          data: parsed.data ?? {},
        });
        setConnectedCount(c => c + 1);
      } catch (err) {
        console.warn('[FastenConnect] Failed to record connection:', err);
        setError('Failed to save this connection. Please try again.');
      }
      return;
    }

    if (eventType === 'widget.complete') {
      // User completed the flow — proceed to data processing
      if (navigating.current) return;
      navigating.current = true;
      setIsLoading(true);
      router.replace('/(onboarding)/data-processing' as never);
      return;
    }

    if (eventType === 'widget.close') {
      // User manually closed the widget
      if (connectedCount > 0) {
        // Already connected at least one clinic — proceed
        if (navigating.current) return;
        navigating.current = true;
        setIsLoading(true);
        router.replace('/(onboarding)/data-processing' as never);
      } else {
        // No clinics connected — show prompt to connect
        setShowWidget(false);
        setWidgetDismissed(true);
      }
    }
  }, [connectedCount]);

  const handleOpenWidget = () => {
    navigating.current = false;
    setWidgetDismissed(false);
    setShowWidget(true);
    setError(null);
  };

  if (!FASTEN_PUBLIC_ID) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorTitle, { color: colors.text, fontSize: getScaledFontSize(18) }]}>
          Configuration Missing
        </Text>
        <Text style={[styles.errorBody, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
          EXPO_PUBLIC_FASTEN_PUBLIC_ID is not set. Add it to your .env file and rebuild.
        </Text>
      </View>
    );
  }

  // Wait for feature permissions before rendering the widget. If
  // CONNECT_CLINIC is disabled, the useEffect above has already kicked
  // off a redirect to /Home — show a spinner until it completes.
  if (permissionsLoading || connectClinicDisabled) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as any, textAlign: 'center', marginTop: 16 }}>
          Setting up your health data...
        </Text>
        <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), textAlign: 'center' }}>
          Please wait while we initiate your medical records export.
        </Text>
      </View>
    );
  }

  // User closed widget without connecting any clinic
  if (widgetDismissed && !showWidget) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={{ fontSize: 56, marginBottom: 16 }}>🏥</Text>
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(22),
            fontWeight: getScaledFontWeight(700) as any,
            textAlign: 'center',
            marginBottom: 8,
          }}
        >
          Connect a Clinic
        </Text>
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(15),
            textAlign: 'center',
            lineHeight: getScaledFontSize(22),
            paddingHorizontal: 20,
            marginBottom: 28,
          }}
        >
          To get started, you need to connect at least one healthcare provider. This allows us to securely access your health records.
        </Text>
        <TouchableOpacity
          style={[styles.connectButton, { backgroundColor: colors.tint }]}
          onPress={handleOpenWidget}
          accessibilityRole="button"
          accessibilityLabel="Connect a clinic"
        >
          <Text
            style={{
              color: '#fff',
              fontSize: getScaledFontSize(16),
              fontWeight: getScaledFontWeight(600) as any,
            }}
          >
            Connect a Clinic
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.signOutButton}
          onPress={async () => {
            await signOut();
            router.replace('/(auth)/sign-in' as never);
          }}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(14),
              fontWeight: getScaledFontWeight(500) as any,
            }}
          >
            Sign out
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {connectedCount > 0 && (
        <View style={styles.successBanner}>
          <Text style={[styles.successBannerText, { fontSize: getScaledFontSize(14) }]}>
            ✓ {connectedCount} provider{connectedCount > 1 ? 's' : ''} connected — you can add more
          </Text>
        </View>
      )}
      {error && (
        <View style={[styles.errorBanner, { backgroundColor: colors.card }]}>
          <Text style={{ color: '#D32F2F', fontSize: getScaledFontSize(14), textAlign: 'center' }}>
            {error}
          </Text>
        </View>
      )}
      <View style={styles.widgetContainer}>
        <FastenStitchElement
          publicId={FASTEN_PUBLIC_ID}
          onEventBus={handleEvent}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  widgetContainer: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  errorTitle: {
    fontWeight: '700',
    textAlign: 'center',
  },
  errorBody: {
    textAlign: 'center',
  },
  errorBanner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
  },
  successBanner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: '#E8F5E9',
  },
  successBannerText: {
    textAlign: 'center',
    color: '#2E7D32',
    fontWeight: '600',
  },
  connectButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 24,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
