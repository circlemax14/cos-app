import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useHealthSummary } from '@/hooks/use-health-summary';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

export function HealthSummaryCard() {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [expanded, setExpanded] = useState(false);
  const { data: summary, isLoading, error, refetch } = useHealthSummary();

  if (isLoading) {
    return (
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border, padding: getScaledFontSize(16) },
        ]}
      >
        <ActivityIndicator size="small" color={colors.primary} />
        <Text
          style={[
            styles.loadingText,
            {
              color: colors.subtext,
              fontSize: getScaledFontSize(13),
            },
          ]}
        >
          Generating your health summary...
        </Text>
      </View>
    );
  }

  if (error || !summary) {
    return (
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border, padding: getScaledFontSize(16) },
        ]}
      >
        <Text
          style={[
            styles.errorText,
            {
              color: colors.subtext,
              fontSize: getScaledFontSize(13),
            },
          ]}
        >
          Unable to generate health summary.
        </Text>
        <TouchableOpacity onPress={() => refetch()}>
          <Text
            style={[
              styles.retryLink,
              {
                color: colors.primary,
                fontSize: getScaledFontSize(13),
              },
            ]}
          >
            Tap to retry
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border, padding: getScaledFontSize(16) },
      ]}
    >
      <Text
        style={[
          styles.cardTitle,
          {
            color: colors.text,
            fontSize: getScaledFontSize(16),
          },
        ]}
      >
        Health Summary
      </Text>
      <Text
        style={[
          styles.overview,
          {
            color: colors.text,
            fontSize: getScaledFontSize(14),
            lineHeight: getScaledFontSize(20),
          },
        ]}
      >
        {summary.overview}
      </Text>

      {expanded && (
        <View style={styles.details}>
          {summary.conditions ? (
            <View style={styles.section}>
              <Text
                style={[
                  styles.sectionTitle,
                  {
                    color: colors.text,
                    fontSize: getScaledFontSize(14),
                  },
                ]}
              >
                Conditions
              </Text>
              <Text
                style={[
                  styles.sectionBody,
                  {
                    color: colors.subtext,
                    fontSize: getScaledFontSize(13),
                    lineHeight: getScaledFontSize(20),
                  },
                ]}
              >
                {summary.conditions}
              </Text>
            </View>
          ) : null}
          {summary.medications ? (
            <View style={styles.section}>
              <Text
                style={[
                  styles.sectionTitle,
                  {
                    color: colors.text,
                    fontSize: getScaledFontSize(14),
                  },
                ]}
              >
                Medications
              </Text>
              <Text
                style={[
                  styles.sectionBody,
                  {
                    color: colors.subtext,
                    fontSize: getScaledFontSize(13),
                    lineHeight: getScaledFontSize(20),
                  },
                ]}
              >
                {summary.medications}
              </Text>
            </View>
          ) : null}
          {summary.recentLabs ? (
            <View style={styles.section}>
              <Text
                style={[
                  styles.sectionTitle,
                  {
                    color: colors.text,
                    fontSize: getScaledFontSize(14),
                  },
                ]}
              >
                Recent Labs
              </Text>
              <Text
                style={[
                  styles.sectionBody,
                  {
                    color: colors.subtext,
                    fontSize: getScaledFontSize(13),
                    lineHeight: getScaledFontSize(20),
                  },
                ]}
              >
                {summary.recentLabs}
              </Text>
            </View>
          ) : null}
          {summary.recommendations ? (
            <View style={styles.section}>
              <Text
                style={[
                  styles.sectionTitle,
                  {
                    color: colors.text,
                    fontSize: getScaledFontSize(14),
                  },
                ]}
              >
                Wellness Recommendations
              </Text>
              <Text
                style={[
                  styles.sectionBody,
                  {
                    color: colors.subtext,
                    fontSize: getScaledFontSize(13),
                    lineHeight: getScaledFontSize(20),
                  },
                ]}
              >
                {summary.recommendations}
              </Text>
            </View>
          ) : null}
          <Text
            style={[
              styles.disclaimer,
              {
                color: colors.subtext,
                fontSize: getScaledFontSize(11),
                lineHeight: getScaledFontSize(16),
              },
            ]}
          >
            This summary is AI-generated for informational purposes only. Always
            consult your healthcare provider for medical decisions.
          </Text>
        </View>
      )}

      <TouchableOpacity
        onPress={() => setExpanded(!expanded)}
        style={styles.toggleButton}
      >
        <Text
          style={[
            styles.toggleText,
            {
              color: colors.primary,
              fontSize: getScaledFontSize(13),
            },
          ]}
        >
          {expanded ? 'Show less' : 'View full summary'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  cardTitle: {
    fontWeight: '700',
  },
  overview: {
  },
  loadingText: {
    textAlign: 'center',
  },
  errorText: {
    textAlign: 'center',
  },
  retryLink: {
    textAlign: 'center',
    textDecorationLine: 'underline',
    marginTop: 4,
  },
  details: {
    gap: 12,
    marginTop: 4,
  },
  section: {
    gap: 4,
  },
  sectionTitle: {
    fontWeight: '600',
  },
  sectionBody: {
  },
  disclaimer: {
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
  },
  toggleButton: {
    alignItems: 'center',
    paddingTop: 4,
  },
  toggleText: {
    fontWeight: '600',
  },
});
