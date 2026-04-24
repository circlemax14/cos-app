import { FastenStitchElement } from '@fastenhealth/fasten-stitch-element-react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

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
    return <ConnectClinicPrompt onConnect={handleOpenWidget} />;
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

// ────────────────────────────────────────────────────────────────────────
// Blocking "Connect a Clinic" screen shown when the Fasten widget is
// dismissed without a connection. Uses the same visual language as the
// Welcome screen — decorative background blobs, animated icon, eyebrow
// + heading + subtitle, benefits list, rounded primary CTA, and a
// subtle Sign out escape hatch.
// ────────────────────────────────────────────────────────────────────────
interface ConnectClinicPromptProps {
  onConnect: () => void;
}

function ConnectClinicPrompt({ onConnect }: ConnectClinicPromptProps) {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const contentOpacity = useSharedValue(0);
  const contentTranslate = useSharedValue(18);
  const iconScale = useSharedValue(1);

  useEffect(() => {
    contentOpacity.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.quad) });
    contentTranslate.value = withTiming(0, { duration: 500, easing: Easing.out(Easing.quad) });
    iconScale.value = withDelay(
      300,
      withRepeat(
        withSequence(
          withTiming(1.08, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      ),
    );
  }, [contentOpacity, contentTranslate, iconScale]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslate.value }],
  }));
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/sign-in' as never);
  };

  const benefits: Array<{ icon: keyof typeof MaterialIcons.glyphMap; text: string }> = [
    { icon: 'medical-services', text: 'See diagnoses, conditions, and visit notes' },
    { icon: 'medication', text: 'Track medications and refills in one place' },
    { icon: 'event-available', text: 'Review appointments and upcoming care' },
  ];

  return (
    <View style={[connectStyles.root, { backgroundColor: colors.background }]}>
      {/* Decorative background blobs — match the Welcome screen. */}
      <View
        pointerEvents="none"
        style={[connectStyles.blobTopRight, { backgroundColor: colors.primary + '1A' }]}
      />
      <View
        pointerEvents="none"
        style={[connectStyles.blobBottomLeft, { backgroundColor: colors.primary + '0F' }]}
      />

      <Animated.View style={[connectStyles.hero, contentStyle]}>
        <Animated.View
          style={[
            connectStyles.iconCircle,
            { backgroundColor: colors.primary + '1A' },
            iconStyle,
          ]}
        >
          <MaterialIcons
            name="local-hospital"
            size={getScaledFontSize(64)}
            color={colors.primary}
          />
        </Animated.View>

        <Text
          style={{
            color: colors.primary,
            fontSize: getScaledFontSize(12),
            fontWeight: getScaledFontWeight(700) as any,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          Get Started
        </Text>

        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(28),
            fontWeight: getScaledFontWeight(700) as any,
            textAlign: 'center',
          }}
        >
          Connect your clinic
        </Text>

        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(15),
            textAlign: 'center',
            lineHeight: getScaledFontSize(22),
            paddingHorizontal: 12,
          }}
        >
          Link your healthcare provider to bring your health records,
          medications, and appointments together in one secure place.
        </Text>

        <View style={connectStyles.benefitsList}>
          {benefits.map((b) => (
            <View key={b.icon} style={connectStyles.benefitRow}>
              <View style={[connectStyles.benefitIcon, { backgroundColor: colors.primary + '1A' }]}>
                <MaterialIcons name={b.icon} size={getScaledFontSize(18)} color={colors.primary} />
              </View>
              <Text
                style={{
                  flex: 1,
                  color: colors.text,
                  fontSize: getScaledFontSize(14),
                  lineHeight: getScaledFontSize(20),
                }}
              >
                {b.text}
              </Text>
            </View>
          ))}
        </View>
      </Animated.View>

      <Animated.View style={[connectStyles.footer, contentStyle]}>
        <Pressable
          onPress={onConnect}
          style={({ pressed }) => [
            connectStyles.primaryButton,
            {
              backgroundColor: colors.primary,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
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
        </Pressable>

        <View style={connectStyles.privacyRow}>
          <MaterialIcons name="lock" size={getScaledFontSize(12)} color={colors.subtext} />
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(11),
              fontWeight: getScaledFontWeight(500) as any,
            }}
          >
            HIPAA-compliant · Your data is encrypted in transit
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleSignOut}
          style={connectStyles.signOutLink}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(13),
              fontWeight: getScaledFontWeight(500) as any,
              textDecorationLine: 'underline',
            }}
          >
            Sign out
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const connectStyles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 28,
    paddingVertical: 56,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  blobTopRight: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    top: -140,
    right: -100,
  },
  blobBottomLeft: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    bottom: -110,
    left: -80,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  iconCircle: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  benefitsList: {
    width: '100%',
    marginTop: 20,
    gap: 12,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  benefitIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    gap: 16,
    alignItems: 'center',
  },
  primaryButton: {
    width: '100%',
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  signOutLink: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
});

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
});
