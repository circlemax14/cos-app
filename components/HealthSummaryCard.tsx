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

      {/*
        COS-855 — say that a refresh is in flight, WITHOUT hiding the summary.

        The care-plan flow replaces its whole screen with a banner, because
        behind it sits a plan built for the tier the patient just left and its
        goals are tappable — acting on the wrong ones is a real harm. A health
        summary is read-only prose: the copy on screen is still true, just
        about to be superseded. Hiding it would take away something useful to
        say nothing new.

        Plain `{cond && <View/>}` with primitives already imported by this
        file, per the iOS 26 rendering envelope in cos-app/CLAUDE.md.
      */}
      {summary.rebuilding === true && (
        <View
          style={[
            styles.rebuildingBanner,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          <ActivityIndicator size="small" color={colors.primary} />
          <Text
            style={[
              styles.rebuildingText,
              { color: colors.subtext, fontSize: getScaledFontSize(12) },
            ]}
          >
            Updating your health summary — we&apos;ll let you know when it&apos;s ready.
          </Text>
        </View>
      )}
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
  rebuildingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 8,
    marginBottom: 4,
  },
  rebuildingText: {
    // `flex: 1` so the sentence wraps beside the spinner instead of pushing
    // it off the card on a narrow device or at a large accessibility size.
    flex: 1,
  },
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
