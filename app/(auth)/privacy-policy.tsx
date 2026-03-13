import { router } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

const SECTIONS = [
  {
    title: '1. Information We Collect',
    body:
      'We collect information you provide directly, such as your name, email address, and health information you choose to share through connected health records (e.g., via Fasten Health). We do not collect health data without your explicit consent.',
  },
  {
    title: '2. How We Use Your Information',
    body:
      'Your health information is used solely to deliver the care coordination services you request. We do not sell your personal or health data. We use it to display your care circle, care plan, medical history, and provider information within the app.',
  },
  {
    title: '3. Protected Health Information (PHI)',
    body:
      'We comply with the Health Insurance Portability and Accountability Act (HIPAA). Your Protected Health Information (PHI) is encrypted in transit and at rest. Access is restricted to authorized personnel only.',
  },
  {
    title: '4. Data Sharing',
    body:
      'We share your information only with your care team (providers, caregivers) that you authorize, and with cloud infrastructure partners (AWS) that process data on our behalf under Business Associate Agreements (BAAs).',
  },
  {
    title: '5. Your Rights',
    body:
      'You have the right to access, correct, or delete your data at any time. To exercise these rights, contact us at privacy@joinabrightfuture.com. We will respond within 30 days.',
  },
  {
    title: '6. Data Retention',
    body:
      'We retain your data for as long as your account is active, or as required by law. Upon account deletion, health data is purged within 30 days, except where retention is required by applicable healthcare regulations.',
  },
  {
    title: '7. Contact Us',
    body:
      'For privacy questions or to exercise your HIPAA rights, contact:\nJoin a Bright Future\nprivacy@joinabrightfuture.com',
  },
];

export default function PrivacyPolicyScreen() {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

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
        <Text style={[styles.intro, { color: colors.subtext, fontSize: getScaledFontSize(13) }]}>
          Last updated: March 2026 · Version 1.0
        </Text>
        <Text style={[styles.intro, { color: colors.text, fontSize: getScaledFontSize(14), marginBottom: 24 }]}>
          Join a Bright Future ("we," "our," or "us") is committed to protecting your privacy and the
          privacy of your health information. This policy explains what data we collect, how we use
          it, and your rights.
        </Text>

        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: getScaledFontSize(15) }]}>
              {section.title}
            </Text>
            <Text style={[styles.sectionBody, { color: colors.subtext ?? colors.text, fontSize: getScaledFontSize(14) }]}>
              {section.body}
            </Text>
          </View>
        ))}

        <View style={[styles.disclaimer, { backgroundColor: colors.card ?? '#f5f5f5', borderColor: colors.border ?? '#e0e0e0' }]}>
          <Text style={[styles.disclaimerText, { color: colors.text, fontSize: getScaledFontSize(13) }]}>
            ⚕️ Medical Disclaimer: This app is a care coordination tool and does not provide medical
            advice. Always consult a qualified healthcare provider for medical decisions.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  intro: { lineHeight: 20, marginBottom: 8 },
  section: { marginBottom: 20 },
  sectionTitle: { fontWeight: '700', marginBottom: 6 },
  sectionBody: { lineHeight: 22 },
  disclaimer: {
    marginTop: 16,
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
  },
  disclaimerText: { lineHeight: 20 },
});
