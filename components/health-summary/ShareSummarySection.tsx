/**
 * ShareSummarySection (COS-452 / SCRUM-591).
 *
 * Renders a card that lets the patient share their Health Summary as a
 * proper PDF file with a doctor, caregiver, or family member. Uses
 * expo-print to render an HTML template to PDF and expo-sharing to open
 * the OS share sheet with the file attached.
 *
 * Native modules — requires a binary cut, not OTA-safe.
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
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { Colors } from '@/constants/theme';
import { Spacing, Radii } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';
import { useHealthSummary } from '@/hooks/use-health-summary';
import { useBiopsychosocialPlan } from '@/hooks/use-biopsychosocial-plan';
import { useConditionList } from './CurrentConditionsSection';

const ACCENT = '#334155';

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

function bulletHtml(text: string): string {
  return text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => `<li>${escape(l.replace(/^[•\-*]\s*/, ''))}</li>`)
    .join('');
}

export default function ShareSummarySection() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [sharing, setSharing] = useState(false);

  const { data: summary } = useHealthSummary();
  const bpsQuery = useBiopsychosocialPlan();
  const { conditions } = useConditionList();

  const buildHtml = (): string => {
    const generated = new Date().toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    const sections = bpsQuery.data?.plan?.sections;
    const bioBullets = sections?.biological?.planBullets ?? [];
    const psyBullets = sections?.psychological?.planBullets ?? [];
    const socBullets = sections?.social?.planBullets ?? [];

    const bpsHtml = sections
      ? `
        <section>
          <h2>Biopsychosocial history</h2>
          ${bioBullets.length ? `<h3 style="color:#199C4F;">Biological</h3><ul>${bioBullets.map(b => `<li>${escape(b)}</li>`).join('')}</ul>` : ''}
          ${psyBullets.length ? `<h3 style="color:#7B3FE4;">Psychological</h3><ul>${psyBullets.map(b => `<li>${escape(b)}</li>`).join('')}</ul>` : ''}
          ${socBullets.length ? `<h3 style="color:#C97600;">Social</h3><ul>${socBullets.map(b => `<li>${escape(b)}</li>`).join('')}</ul>` : ''}
        </section>`
      : '';

    const conditionsHtml =
      conditions.length > 0
        ? `<section><h2>Current conditions</h2><ul>${conditions.map(c => `<li>${escape(c)}</li>`).join('')}</ul></section>`
        : '';
    const medsHtml = summary?.medications
      ? `<section><h2>Medications</h2><pre>${escape(stringifyValue(summary.medications))}</pre></section>`
      : '';
    const labsHtml = summary?.recentLabs
      ? `<section><h2>Lab results</h2><pre>${escape(stringifyValue(summary.recentLabs))}</pre></section>`
      : '';
    const recsHtml = summary?.recommendations
      ? `<section><h2>Recommendations</h2><ul>${bulletHtml(summary.recommendations)}</ul></section>`
      : '';

    return `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Health Summary</title>
<style>
  @page { margin: 0.75in; }
  body { font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #111827; font-size: 12pt; line-height: 1.45; }
  header { border-bottom: 3px solid #199C4F; padding-bottom: 12px; margin-bottom: 20px; }
  header h1 { font-size: 22pt; margin: 0 0 4px 0; color: #111827; }
  header .meta { color: #64748b; font-size: 10pt; }
  section { margin-bottom: 22px; page-break-inside: avoid; }
  section h2 { font-size: 14pt; color: #199C4F; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin: 0 0 8px 0; }
  section h3 { font-size: 11pt; margin: 12px 0 4px 0; }
  ul { padding-left: 20px; margin: 4px 0; }
  li { margin: 2px 0; }
  pre { white-space: pre-wrap; font-family: inherit; margin: 4px 0; padding: 8px; background: #f8fafc; border-radius: 6px; }
  footer { border-top: 1px solid #e2e8f0; padding-top: 10px; margin-top: 30px; color: #94a3b8; font-size: 9pt; }
</style>
</head>
<body>
  <header>
    <h1>Health Summary</h1>
    <div class="meta">Generated ${escape(generated)} · Circle Support Health</div>
  </header>
  ${bpsHtml}
  ${conditionsHtml}
  ${medsHtml}
  ${labsHtml}
  ${recsHtml}
  <footer>
    This is a snapshot at the moment of sharing. For the most current version, ask the patient to re-share their summary from the Circle Support Health app.
  </footer>
</body>
</html>`;
  };

  // Fallback: strip HTML tags to plain text for older binaries that don't
  // have the expo-print / expo-sharing native modules linked yet. Keeps
  // the button working via RN's built-in Share on those installs.
  const htmlToText = (html: string): string =>
    html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();

  const shareTextFallback = async (html: string) => {
    const message = htmlToText(html);
    await Share.share(
      { message, title: 'My Health Summary' },
      { subject: 'My Health Summary' },
    );
  };

  const onShare = async () => {
    if (sharing) return;
    setSharing(true);
    const html = buildHtml();
    try {
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share Health Summary',
          UTI: 'com.adobe.pdf',
        });
      } else {
        // Native module present but sharing unavailable — degrade to text.
        await shareTextFallback(html);
      }
    } catch (err) {
      // Old binary without the expo-print/expo-sharing modules linked
      // (or a transient failure) — fall back to a plain-text share so
      // the button still works. Once the next binary ships, this branch
      // is silent.
      try {
        await shareTextFallback(html);
      } catch {
        Alert.alert('Could not share', 'Please try again in a moment.');
      }
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
            name="picture-as-pdf"
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
            Send a PDF copy to a doctor, caregiver, or family member.
          </Text>
        </View>
      </View>

      <Pressable
        onPress={onShare}
        disabled={sharing}
        accessibilityRole="button"
        accessibilityLabel="Share health summary as PDF"
        accessibilityHint="Generates a PDF of your health summary and opens the share sheet"
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
          {sharing ? 'Preparing PDF…' : 'Share as PDF'}
        </Text>
      </Pressable>
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
