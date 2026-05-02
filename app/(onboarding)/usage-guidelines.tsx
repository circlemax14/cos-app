import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiClient } from '@/lib/api-client';
import { isPinSetup } from '@/services/pin-auth';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

interface GuidelineSection {
  heading: string;
  body: string;
}

interface GuidelinesResponse {
  success: boolean;
  data: {
    version: string;
    updatedAt: string;
    sections: GuidelineSection[];
  };
}

export default function UsageGuidelinesScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const scrollViewRef = useRef<ScrollView>(null);

  const [guidelines, setGuidelines] = useState<GuidelinesResponse['data'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contentOpacity = useSharedValue(0);
  const contentTranslate = useSharedValue(16);

  // Soft accent tints to match the bubble treatment used on Welcome and AppWrapper screens.
  const tintSoft = colors.primary + '1A';
  const tintSofter = colors.primary + '0F';
  const tintHairline = colors.primary + '22';

  useEffect(() => {
    const fetchGuidelines = async () => {
      try {
        const res = await apiClient.get<GuidelinesResponse>('/v1/content/usage-guidelines');
        setGuidelines(res.data.data);
      } catch {
        setError('Failed to load usage guidelines. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchGuidelines();
  }, []);

  useEffect(() => {
    if (!loading && guidelines) {
      contentOpacity.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.quad) });
      contentTranslate.value = withTiming(0, { duration: 500, easing: Easing.out(Easing.quad) });
    }
  }, [loading, guidelines, contentOpacity, contentTranslate]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslate.value }],
  }));

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (hasScrolledToEnd) return;
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
      const paddingToBottom = 40;
      const isAtBottom =
        layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
      if (isAtBottom) {
        setHasScrolledToEnd(true);
      }
    },
    [hasScrolledToEnd],
  );

  const handleAccept = async () => {
    if (!guidelines) return;
    setAccepting(true);
    setError(null);
    try {
      await apiClient.post('/v1/auth/accept-terms', {
        version: guidelines.version,
      });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { error?: string } } };
      const status = axiosErr?.response?.status;
      const serverMsg = axiosErr?.response?.data?.error;

      if (status !== 409) {
        if (status === 401) {
          setError('Your session has expired. Please sign in again.');
        } else {
          setError(serverMsg ?? 'Failed to accept guidelines. Please try again.');
        }
        setAccepting(false);
        return;
      }
    }

    try {
      const pinConfigured = await isPinSetup();
      if (!pinConfigured) {
        router.replace('/(security)/setup-pin' as never);
      } else {
        router.replace('/(onboarding)/permissions' as never);
      }
    } catch {
      router.replace('/(onboarding)/permissions' as never);
    }
  };

  const Bubbles = () => (
    <>
      <View
        pointerEvents="none"
        style={[styles.bubbleTopRight, { backgroundColor: tintSoft }]}
      />
      <View
        pointerEvents="none"
        style={[styles.bubbleBottomLeft, { backgroundColor: tintSofter }]}
      />
    </>
  );

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['top', 'left', 'right', 'bottom']}
      >
        <Bubbles />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text
            style={[
              styles.loadingText,
              { color: colors.subtext, fontSize: getScaledFontSize(15) },
            ]}
          >
            Loading usage guidelines...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!guidelines) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['top', 'left', 'right', 'bottom']}
      >
        <Bubbles />
        <View style={styles.centered}>
          <View style={[styles.iconCircle, { backgroundColor: tintSoft }]}>
            <Text style={{ fontSize: getScaledFontSize(48) }}>⚠️</Text>
          </View>
          <Text
            style={[
              styles.errorText,
              { color: colors.text, fontSize: getScaledFontSize(16) },
            ]}
          >
            {error ?? 'Unable to load guidelines.'}
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
            onPress={() => {
              setLoading(true);
              setError(null);
              apiClient
                .get<GuidelinesResponse>('/v1/content/usage-guidelines')
                .then((res) => setGuidelines(res.data.data))
                .catch(() => setError('Failed to load usage guidelines.'))
                .finally(() => setLoading(false));
            }}
          >
            <Text
              style={[
                styles.primaryButtonText,
                {
                  fontSize: getScaledFontSize(16),
                  fontWeight: getScaledFontWeight(600) as '600',
                },
              ]}
            >
              Retry
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top', 'left', 'right', 'bottom']}
    >
      <Bubbles />

      <Animated.View style={[styles.header, contentStyle]}>
        <View style={[styles.iconCircle, { backgroundColor: tintSoft }]}>
          <Text style={{ fontSize: getScaledFontSize(40) }} accessibilityElementsHidden>
            📖
          </Text>
        </View>

        <Text
          style={[
            styles.eyebrow,
            {
              color: colors.primary,
              fontSize: getScaledFontSize(12),
              fontWeight: getScaledFontWeight(600) as '600',
            },
          ]}
        >
          BEFORE YOU CONTINUE
        </Text>

        <Text
          style={[
            styles.title,
            {
              color: colors.text,
              fontSize: getScaledFontSize(28),
              fontWeight: getScaledFontWeight(700) as '700',
            },
          ]}
        >
          Usage Guidelines
        </Text>

        <Text
          style={[
            styles.versionText,
            {
              color: colors.subtext,
              fontSize: getScaledFontSize(12),
            },
          ]}
        >
          Version {guidelines.version} · Updated {guidelines.updatedAt}
        </Text>

        <View
          style={[
            styles.disclaimerBanner,
            {
              backgroundColor: tintSofter,
              borderColor: tintHairline,
            },
          ]}
        >
          <Text style={{ fontSize: getScaledFontSize(20) }}>⚕️</Text>
          <Text
            style={[
              styles.disclaimerText,
              {
                color: colors.text,
                fontSize: getScaledFontSize(13),
                lineHeight: getScaledFontSize(19),
              },
            ]}
          >
            This app is for care coordination only and does not provide medical
            advice. Always consult your healthcare provider for medical decisions.
          </Text>
        </View>
      </Animated.View>

      <Animated.View style={[styles.scrollWrapper, contentStyle]}>
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={true}
        >
          {guidelines.sections.map((section, index) => (
            <View
              key={index}
              style={[
                styles.sectionCard,
                {
                  backgroundColor: colors.card,
                  borderColor: tintHairline,
                },
              ]}
            >
              <Text
                style={[
                  styles.sectionHeading,
                  {
                    color: colors.text,
                    fontSize: getScaledFontSize(16),
                    fontWeight: getScaledFontWeight(700) as '700',
                  },
                ]}
              >
                {section.heading}
              </Text>
              <Text
                style={[
                  styles.sectionBody,
                  {
                    color: colors.subtext,
                    fontSize: getScaledFontSize(14),
                    lineHeight: getScaledFontSize(21),
                  },
                ]}
              >
                {section.body}
              </Text>
            </View>
          ))}
          <View style={styles.endSpacer} />
        </ScrollView>
      </Animated.View>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.background,
            borderTopColor: tintHairline,
          },
        ]}
      >
        {error ? (
          <Text style={[styles.footerError, { fontSize: getScaledFontSize(13) }]}>
            {error}
          </Text>
        ) : null}

        {!hasScrolledToEnd && (
          <View style={styles.scrollHintRow}>
            <Text
              style={[
                styles.scrollHint,
                { color: colors.subtext, fontSize: getScaledFontSize(13) },
              ]}
            >
              ↓ Scroll to the bottom to enable
            </Text>
          </View>
        )}

        <Pressable
          onPress={handleAccept}
          disabled={!hasScrolledToEnd || accepting}
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor:
                hasScrolledToEnd && !accepting ? colors.primary : colors.disabled,
              opacity: pressed && hasScrolledToEnd ? 0.9 : 1,
            },
          ]}
          accessibilityLabel="Accept usage guidelines"
          accessibilityRole="button"
          accessibilityState={{ disabled: !hasScrolledToEnd || accepting }}
        >
          {accepting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text
              style={[
                styles.primaryButtonText,
                {
                  fontSize: getScaledFontSize(16),
                  fontWeight: getScaledFontWeight(700) as '700',
                },
              ]}
            >
              I Accept the Usage Guidelines
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  bubbleTopRight: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 180,
    top: -200,
    right: -160,
  },
  bubbleBottomLeft: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    bottom: -160,
    left: -120,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  loadingText: {
    textAlign: 'center',
    marginTop: 8,
  },
  errorText: {
    textAlign: 'center',
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 6,
  },
  eyebrow: {
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  title: {
    textAlign: 'center',
  },
  versionText: {
    textAlign: 'center',
    opacity: 0.85,
  },
  disclaimerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignSelf: 'stretch',
  },
  disclaimerText: {
    flex: 1,
  },
  scrollWrapper: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
  },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    gap: 6,
  },
  sectionHeading: {},
  sectionBody: {},
  endSpacer: {
    height: 12,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 20,
    borderTopWidth: 1,
    gap: 10,
  },
  footerError: {
    color: 'crimson',
    textAlign: 'center',
  },
  scrollHintRow: {
    alignItems: 'center',
  },
  scrollHint: {
    textAlign: 'center',
    fontStyle: 'italic',
  },
  primaryButton: {
    paddingVertical: 16,
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
  primaryButtonText: {
    color: '#fff',
  },
});
