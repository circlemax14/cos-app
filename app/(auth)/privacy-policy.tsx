import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';

import { apiClient } from '@/lib/api-client';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

interface PolicySection {
  heading: string;
  body: string;
}

interface PrivacyContent {
  version: string;
  updatedAt: string;
  sections: PolicySection[];
}

export default function PrivacyPolicyScreen() {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const [content, setContent] = useState<PrivacyContent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<{ success: boolean; data: PrivacyContent }>('/v1/content/privacy')
      .then((res) => setContent(res.data.data))
      .catch(() => setContent(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const formattedDate = content?.updatedAt
    ? new Date(content.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
    : 'Unknown';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border ?? '#e0e0e0' }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={{ color: colors.primary ?? '#0a7ea4', fontSize: getScaledFontSize(16) }}>
            ← Back
          </Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: getScaledFontSize(18) }]}>
          Privacy Policy
        </Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {content ? (
          <>
            <Text style={[styles.intro, { color: colors.subtext, fontSize: getScaledFontSize(13) }]}>
              Last updated: {formattedDate} · Version {content.version}
            </Text>

            {content.sections.map((section) => (
              <View key={section.heading} style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text, fontSize: getScaledFontSize(15) }]}>
                  {section.heading}
                </Text>
                <Text style={[styles.sectionBody, { color: colors.subtext ?? colors.text, fontSize: getScaledFontSize(14) }]}>
                  {section.body}
                </Text>
              </View>
            ))}
          </>
        ) : (
          <Text style={[styles.sectionBody, { color: colors.subtext ?? colors.text, fontSize: getScaledFontSize(14) }]}>
            Unable to load Privacy Policy. Please try again.
          </Text>
        )}

        <View style={[styles.disclaimer, { backgroundColor: colors.card ?? '#f5f5f5', borderColor: colors.border ?? '#e0e0e0' }]}>
          <Text style={[styles.disclaimerText, { color: colors.text, fontSize: getScaledFontSize(13) }]}>
            Medical Disclaimer: This app is a care coordination tool and does not provide medical
            advice. Always consult a qualified healthcare provider for medical decisions.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: { width: 60 },
  headerTitle: { fontWeight: '700', textAlign: 'center', flex: 1 },
  content: { padding: 20, paddingBottom: 48 },
  intro: { marginBottom: 8 },
  section: { marginBottom: 20 },
  sectionTitle: { fontWeight: '700', marginBottom: 6 },
  sectionBody: {},
  disclaimer: {
    marginTop: 16,
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
  },
  disclaimerText: {},
});
