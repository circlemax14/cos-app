import { FastenStitchElement } from '@fastenhealth/fasten-stitch-element-react-native';
import { router } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { apiClient } from '@/lib/api-client';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

const FASTEN_PUBLIC_ID = process.env.EXPO_PUBLIC_FASTEN_PUBLIC_ID ?? '';

export default function FastenConnectScreen() {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  // Prevent processing twice if multiple success events fire
  const processing = useRef(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEvent = useCallback(async (event: unknown) => {
    if (processing.current) return;

    // The event may arrive as a parsed object or as a wrapper with a stringified payload
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

    if (
      eventType === 'widget.complete' ||
      eventType === 'widget.close' ||
      eventType === 'patient.connection_success'
    ) {
      processing.current = true;
      setIsLoading(true);
      setError(null);

      try {
        // Send connection data to backend to store and trigger Bulk Records export
        await apiClient.post('/v1/fasten/connection', {
          api_mode: parsed.api_mode ?? 'test',
          event_type: eventType,
          data: parsed.data ?? {},
        });

        // Navigate to data-processing screen (shows waiting message)
        router.replace('/(onboarding)/data-processing' as never);
      } catch (err) {
        console.warn('[FastenConnect] Failed to process connection event:', err);
        setError('Failed to initiate health data export. Please try again.');
        processing.current = false;
        setIsLoading(false);
      }
    }
  }, []);

  if (!FASTEN_PUBLIC_ID) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorTitle, { color: colors.text, fontSize: getScaledFontSize(18) }]}>
          Configuration Missing
        </Text>
        <Text style={[styles.errorBody, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
          EXPO_PUBLIC_FASTEN_PUBLIC_ID is not set. Add it to your .env file and rebuild.
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.loaderContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loaderTitle, { color: colors.text, fontSize: getScaledFontSize(18) }]}>
          Setting up your health data...
        </Text>
        <Text style={[styles.loaderBody, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
          Please wait while we initiate your medical records export.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {error && (
        <View style={[styles.errorBanner, { backgroundColor: colors.card }]}>
          <Text style={[styles.errorBannerText, { color: '#D32F2F', fontSize: getScaledFontSize(14) }]}>
            {error}
          </Text>
        </View>
      )}
      {/* Fasten Connect widget — fills all space */}
      <View style={styles.widgetContainer}>
        <FastenStitchElement
          publicId={FASTEN_PUBLIC_ID}
          onEventBus={handleEvent}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  widgetContainer: {
    flex: 1,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  loaderTitle: {
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 16,
  },
  loaderBody: {
    textAlign: 'center',
    lineHeight: 22,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  errorTitle: {
    fontWeight: '700',
    textAlign: 'center',
  },
  errorBody: {
    textAlign: 'center',
    lineHeight: 22,
  },
  errorBanner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
  },
  errorBannerText: {
    textAlign: 'center',
  },
});
