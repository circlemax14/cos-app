import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { apiClient } from '@/lib/api-client';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

interface GuidelineSection {
  heading: string;
  body: string;
}

interface GuidelinesResponse {
  success: boolean;
  data: {
    currentVersion: string;
    updatedAt: string;
    sections: GuidelineSection[];
  };
}

export default function UsageGuidelinesScreen() {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const scrollViewRef = useRef<ScrollView>(null);

  const [guidelines, setGuidelines] = useState<GuidelinesResponse['data'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await apiClient.post('/v1/auth/accept-terms', { version: guidelines.currentVersion });
      router.replace('/(onboarding)/fasten-connect' as never);
    } catch {
      setError('Failed to accept guidelines. Please try again.');
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.subtext, fontSize: getScaledFontSize(15) }]}>
          Loading usage guidelines...
        </Text>
      </View>
    );
  }

  if (!guidelines) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: 'crimson', fontSize: getScaledFontSize(15) }]}>
          {error ?? 'Unable to load guidelines.'}
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
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
          <Text style={[styles.retryText, { fontSize: getScaledFontSize(16) }]}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(22) }]}>
          Usage Guidelines
        </Text>
        <Text style={[styles.subtitle, { color: colors.subtext, fontSize: getScaledFontSize(13) }]}>
          Version {guidelines.currentVersion} — Last updated {guidelines.updatedAt}
        </Text>
        <Text style={[styles.instruction, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
          Please read the following guidelines carefully. Scroll to the bottom to accept.
        </Text>
        <View style={[styles.disclaimerBanner, { backgroundColor: colors.card ?? '#f0f7ff', borderColor: colors.border ?? '#d0e4f7' }]}>
          <Text style={{ color: colors.text, fontSize: getScaledFontSize(13), textAlign: 'center', lineHeight: getScaledFontSize(18) }}>
            ⚕️ This app is for care coordination only and does not provide medical advice. Always consult your healthcare provider for medical decisions.
          </Text>
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={true}
      >
        {guidelines.sections.map((section, index) => (
          <View key={index} style={styles.section}>
            <Text style={[styles.sectionHeading, { color: colors.text, fontSize: getScaledFontSize(16) }]}>
              {index + 1}. {section.heading}
            </Text>
            <Text style={[styles.sectionBody, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
              {section.body}
            </Text>
          </View>
        ))}
        <View style={styles.endSpacer} />
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        {error ? (
          <Text style={[styles.footerError, { fontSize: getScaledFontSize(13) }]}>{error}</Text>
        ) : null}
        {!hasScrolledToEnd && (
          <Text style={[styles.scrollHint, { color: colors.subtext, fontSize: getScaledFontSize(13) }]}>
            Scroll to the bottom to enable acceptance
          </Text>
        )}
        <TouchableOpacity
          style={[
            styles.acceptButton,
            {
              backgroundColor: hasScrolledToEnd && !accepting ? colors.primary : '#9ca3af',
            },
          ]}
          onPress={handleAccept}
          disabled={!hasScrolledToEnd || accepting}
          accessibilityLabel="Accept usage guidelines"
          accessibilityState={{ disabled: !hasScrolledToEnd || accepting }}
        >
          {accepting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.acceptText, { fontSize: getScaledFontSize(16) }]}>
              I Accept the Usage Guidelines
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  loadingText: {
    textAlign: 'center',
    marginTop: 8,
  },
  errorText: {
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 16,
    gap: 6,
  },
  title: {
    fontWeight: '700',
  },
  subtitle: {
    opacity: 0.7,
  },
  instruction: {
    marginTop: 4,
    fontStyle: 'italic',
  },
  disclaimerBanner: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  section: {
    marginBottom: 20,
    gap: 6,
  },
  sectionHeading: {
    fontWeight: '600',
  },
  sectionBody: {
  },
  endSpacer: {
    height: 20,
  },
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    paddingBottom: 40,
    borderTopWidth: 1,
    gap: 8,
  },
  footerError: {
    color: 'crimson',
    textAlign: 'center',
  },
  scrollHint: {
    textAlign: 'center',
    fontStyle: 'italic',
  },
  acceptButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  acceptText: {
    color: '#fff',
    fontWeight: '700',
  },
});
