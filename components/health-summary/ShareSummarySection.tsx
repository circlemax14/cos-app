/**
 * ShareSummarySection (COS-452 / SCRUM-591).
 *
 * A card that lets the patient share their Health Summary with a doctor,
 * caregiver, or family member. Uses React Native's built-in Share API to
 * open the OS share sheet with a formatted text version of every section
 * currently on screen. OTA-safe (no new native deps).
 *
 * FUTURE (needs binary cut): swap to expo-print + expo-sharing to export
 * a proper styled PDF. Tracked under HS-6.
 */
import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Colors } from '@/constants/theme';
import { Spacing, Radii } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';
import { useHealthSummary } from '@/hooks/use-health-summary';
import { useBiopsychosocialPlan } from '@/hooks/use-biopsychosocial-plan';
import { useConditionList } from './CurrentConditionsSection';

const ACCENT = '#334155';

function formatSectionText(title: string, body: string): string {
  return `${title.toUpperCase()}\n${'-'.repeat(title.length)}\n${body.trim() || 'No data yet.'}\n`;
}

function stringifyValue(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => `${k}: ${typeof val === 'string' ? val : JSON.stringify(val)}`)
      .join('\n');
  }
  return String(v);
}

export default function ShareSummarySection() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [sharing, setSharing] = useState(false);

  const { data: summary } = useHealthSummary();
  const bpsQuery = useBiopsychosocialPlan();
  const { conditions } = useConditionList();

  const buildShareText = (): string => {
    const now = new Date().toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    const parts: string[] = [];
    parts.push(`HEALTH SUMMARY\nGenerated ${now}\n`);

    const sections = bpsQuery.data?.plan?.sections;
    if (sections) {
      const bioText = sections.biological?.planBullets?.join('\n• ') ?? '';
      const psyText = sections.psychological?.planBullets?.join('\n• ') ?? '';
      const socText = sections.social?.planBullets?.join('\n• ') ?? '';
      parts.push(
        formatSectionText(
          'Biopsychosocial history',
          [
            bioText ? `Biological:\n• ${bioText}` : '',
            psyText ? `\nPsychological:\n• ${psyText}` : '',
            socText ? `\nSocial:\n• ${socText}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        ),
      );
    }

    if (conditions.length > 0) {
      parts.push(formatSectionText('Current conditions', conditions.map(c => `• ${c}`).join('\n')));
    }

    if (summary?.medications) {
      parts.push(formatSectionText('Medications', stringifyValue(summary.medications)));
    }

    if (summary?.recentLabs) {
      parts.push(formatSectionText('Lab results', stringifyValue(summary.recentLabs)));
    }

    if (summary?.recommendations) {
      parts.push(formatSectionText('Recommendations', summary.recommendations));
    }

    parts.push(
      '\n--\nGenerated from Circle Support Health\nThis is a snapshot at the moment of sharing. For the most current version, ask the patient to re-share.',
    );
    return parts.join('\n');
  };

  const onShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const message = buildShareText();
      await Share.share(
        { message, title: 'My Health Summary' },
        { subject: 'My Health Summary' },
      );
    } catch (err) {
      Alert.alert('Could not share', 'Please try again in a moment.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <View
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.iconChip, { backgroundColor: ACCENT + '1A' }]}>
          <MaterialIcons
            name="ios-share"
            size={getScaledFontSize(20)}
            color={ACCENT}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            accessibilityRole="header"
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(17),
              fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
            }}
          >
            Share this summary
          </Text>
          <Text
            style={{
              color: colors.subtext,
              marginTop: 2,
              fontSize: getScaledFontSize(13),
              fontWeight: getScaledFontWeight(400) as TextStyle['fontWeight'],
            }}
          >
            Send a snapshot to a doctor, caregiver, or family member.
          </Text>
        </View>
      </View>

      <Pressable
        onPress={onShare}
        disabled={sharing}
        accessibilityRole="button"
        accessibilityLabel="Share health summary"
        accessibilityHint="Opens the share sheet with your health summary as text"
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: ACCENT,
            opacity: pressed || sharing ? 0.7 : 1,
          },
        ]}
      >
        <MaterialIcons name="share" size={getScaledFontSize(18)} color="#fff" />
        <Text
          style={{
            color: '#fff',
            marginLeft: 8,
            fontSize: getScaledFontSize(15),
            fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
          }}
        >
          {sharing ? 'Preparing…' : 'Share summary'}
        </Text>
      </Pressable>

      <Text
        style={{
          color: colors.subtext,
          marginTop: Spacing.sm,
          fontSize: getScaledFontSize(11),
          fontWeight: getScaledFontWeight(400) as TextStyle['fontWeight'],
          fontStyle: 'italic',
        }}
      >
        PDF export coming in the next app update.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: Radii.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.md,
  },
});
