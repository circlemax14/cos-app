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
import Checkbox from 'expo-checkbox';

import { apiClient } from '@/lib/api-client';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

interface PolicySection {
  heading: string;
  body: string;
}

interface TermsContent {
  version: string;
  updatedAt: string;
  sections: PolicySection[];
}

export default function TermsScreen() {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const [content, setContent] = useState<TermsContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const scrollViewHeight = useRef(0);
  const contentHeight = useRef(0);

  useEffect(() => {
    apiClient
      .get<{ success: boolean; data: TermsContent }>('/v1/content/terms')
      .then((res) => setContent(res.data.data))
      .catch(() => setContent(null))
      .finally(() => setLoading(false));
  }, []);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const paddingToBottom = 40;
    const isBottom =
      layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
    if (isBottom) setScrolledToBottom(true);
  }, []);

  const handleAccept = useCallback(async () => {
    if (!content || !agreed) return;
    setAccepting(true);
    try {
      await apiClient.post('/v1/auth/accept-terms', { version: content.version });
      router.replace('/(onboarding)/fasten-connect' as never);
    } catch {
      // Non-critical — allow proceeding if already accepted
      router.replace('/(onboarding)/fasten-connect' as never);
    } finally {
      setAccepting(false);
    }
  }, [content, agreed]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: getScaledFontSize(20) }]}>
          Terms & Conditions
        </Text>
        <Text style={[styles.headerSub, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>
          Please read and scroll to the bottom to continue.
        </Text>
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onLayout={(e) => { scrollViewHeight.current = e.nativeEvent.layout.height; }}
        onContentSizeChange={(_, h) => { contentHeight.current = h; }}
      >
        {content?.sections.map((section, i) => (
          <View key={i} style={styles.section}>
            <Text style={[styles.sectionHeading, { color: colors.text, fontSize: getScaledFontSize(16) }]}>
              {section.heading}
            </Text>
            <Text style={[styles.sectionBody, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
              {section.body}
            </Text>
          </View>
        ))}
        {!content && (
          <Text style={[styles.sectionBody, { color: colors.subtext }]}>
            Unable to load Terms & Conditions. Please try again.
          </Text>
        )}
        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Footer — checkbox + button */}
      <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
        <TouchableOpacity
          style={[styles.checkboxRow, !scrolledToBottom && styles.disabled]}
          onPress={() => scrolledToBottom && setAgreed(!agreed)}
          disabled={!scrolledToBottom}
          accessibilityLabel="I have read and agree to the Terms and Conditions"
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreed, disabled: !scrolledToBottom }}
        >
          <Checkbox
            value={agreed}
            onValueChange={setAgreed}
            disabled={!scrolledToBottom}
            color={agreed ? colors.primary : undefined}
          />
          <Text style={[styles.checkboxLabel, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
            I have read and agree to the Terms &amp; Conditions
          </Text>
        </TouchableOpacity>

        {!scrolledToBottom && (
          <Text style={[styles.scrollHint, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>
            ↓ Scroll to the bottom to enable
          </Text>
        )}

        <TouchableOpacity
          style={[
            styles.button,
            { backgroundColor: agreed ? colors.primary : colors.disabled },
          ]}
          onPress={handleAccept}
          disabled={!agreed || accepting}
          accessibilityLabel={agreed ? 'Accept terms and continue' : 'Accept terms to continue (scroll to bottom first)'}
          accessibilityRole="button"
          accessibilityState={{ disabled: !agreed || accepting }}
        >
          {accepting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.buttonText, { fontSize: getScaledFontSize(16) }]}>
              Continue
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { padding: 20, borderBottomWidth: 1 },
  headerTitle: { fontWeight: '700' },
  headerSub: { marginTop: 4 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20 },
  section: { marginBottom: 24 },
  sectionHeading: { fontWeight: '700', marginBottom: 8 },
  sectionBody: {},
  bottomPadding: { height: 32 },
  footer: { padding: 20, borderTopWidth: 1, gap: 12 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkboxLabel: { flex: 1 },
  disabled: { opacity: 0.4 },
  scrollHint: { textAlign: 'center' },
  button: { paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
});
