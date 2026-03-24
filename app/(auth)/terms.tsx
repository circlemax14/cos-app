import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { AppWrapper } from '@/components/app-wrapper';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { apiClient } from '@/lib/api-client';
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

export default function AuthTermsScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const [content, setContent] = useState<TermsContent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<{ success: boolean; data: TermsContent }>('/v1/content/terms')
      .then((res) => setContent(res.data.data))
      .catch(() => setContent(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <AppWrapper showBellIcon={false} showLogo={false} showHamburgerIcon={false} showAccessibilityIcon={false}>
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </AppWrapper>
    );
  }

  return (
    <AppWrapper showBellIcon={false} showLogo={false} showHamburgerIcon={false} showAccessibilityIcon={false}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Go back">
            <IconSymbol name="chevron.left" size={getScaledFontSize(22)} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text, fontSize: getScaledFontSize(20), lineHeight: getScaledFontSize(28), fontWeight: getScaledFontWeight(600) as any }]}>
            Terms & Conditions
          </Text>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {content?.sections.map((section, i) => (
            <View key={i} style={styles.section}>
              <Text style={[styles.sectionHeading, { color: colors.text, fontSize: getScaledFontSize(16), lineHeight: getScaledFontSize(22), fontWeight: getScaledFontWeight(600) as any }]}>
                {section.heading}
              </Text>
              <Text style={[styles.sectionBody, { color: colors.subtext, fontSize: getScaledFontSize(14), lineHeight: getScaledFontSize(22) }]}>
                {section.body}
              </Text>
            </View>
          ))}
          {!content && (
            <Text style={[styles.sectionBody, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
              Unable to load Terms & Conditions. Please try again later.
            </Text>
          )}
          <View style={styles.bottomPadding} />
        </ScrollView>
      </View>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, gap: 8 },
  headerTitle: { flex: 1 },
  backButton: { padding: 4 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20 },
  section: { marginBottom: 24 },
  sectionHeading: { marginBottom: 8 },
  sectionBody: {},
  bottomPadding: { height: 32 },
});
