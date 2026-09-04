/**
 * ShareIntakeReportSection (COS-452 Ken v5 pass).
 *
 * Sibling to `health-summary/ShareSummarySection` — same expo-print + expo-sharing
 * pipeline with the RN Share plain-text fallback so binaries without the native
 * modules linked still work — but its `buildHtml` renders the intake report
 * (six clinical groups + screener scores) instead of the Health Summary.
 *
 * Mounted inside `IntakeReportScreen`, above the "Update my answers" retake CTA.
 * Both `expo-print` and `expo-sharing` are already linked in the current binary
 * via `ShareSummarySection` (SCRUM-591), so this is OTA-safe.
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
import { useCanRender } from '@/hooks/use-entitlement';
import { usePatientIntake } from '@/hooks/use-patient-intake';
import { useImmunizations } from '@/hooks/use-immunizations';
import { immunizationToRow } from '@/services/api/patient-immunizations';
import {
  buildReport,
  IMMUNIZATIONS_EHR_ENABLED,
  type EhrRowsByGroup,
  type Group,
  type Row,
  type ScoreBlock,
} from './intake-report-builder';

const ACCENT = '#334155';

// Matches the sibling helper in ShareSummarySection so all patient-facing
// PDFs escape user-provided strings identically before HTML injection.
function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function scorePillBgHex(interp: ScoreBlock['interpretation']): string {
  switch (interp) {
    case 'positive':
    case 'low':
      return '#FEE2E2';
    case 'moderate':
      return '#FEF3C7';
    case 'strong':
    case 'below-threshold':
      return '#DCFCE7';
    case 'info':
    default:
      return '#E2E8F0';
  }
}

function scorePillFgHex(interp: ScoreBlock['interpretation']): string {
  switch (interp) {
    case 'positive':
    case 'low':
      return '#DC2626';
    case 'moderate':
      return '#D97706';
    case 'strong':
    case 'below-threshold':
      return '#166534';
    case 'info':
    default:
      return '#334155';
  }
}

function renderScoresHtml(blocks: ScoreBlock[]): string {
  return `
<div style="margin-top:8px;">
  ${blocks
    .map(
      (b) => `
    <div style="padding:8px; margin-top:6px; background:#f8fafc; border-radius:6px;">
      <strong>${escape(b.name)}:</strong> ${b.sum}/${b.max}
      <span style="margin-left:8px; padding:2px 8px; border-radius:999px; background:${scorePillBgHex(
        b.interpretation,
      )}; color:${scorePillFgHex(b.interpretation)}; font-size:10pt;">${escape(
        b.label,
      )}</span>
      ${
        b.footnote
          ? `<div style="margin-top:4px; color:#64748b; font-size:9pt; font-style:italic;">${escape(
              b.footnote,
            )}</div>`
          : ''
      }
    </div>`,
    )
    .join('')}
</div>`;
}

function renderRowsHtml(rows: Row[]): string {
  return `<table style="width:100%; border-collapse:collapse;">
    ${rows
      .map(
        (r) =>
          `<tr><td style="padding:4px 0; color:#64748b; width:45%; vertical-align:top;">${escape(
            r.label,
          )}</td><td style="padding:4px 0; vertical-align:top;">${escape(
            r.value,
          )}</td></tr>`,
      )
      .join('')}
  </table>`;
}

function renderGroupHtml(g: Group): string {
  const ehrRows = g.ehrRows ?? [];
  const hasSelfContent = g.rows.some((r) => !r.missing);
  const hasEhr = ehrRows.length > 0;
  const showBoth = hasEhr && hasSelfContent;
  // Match the on-screen empty-state rule: when we have EHR content but the
  // patient never answered the intake question, suppress the "Not shared"
  // filler rows so the PDF doesn't render a bogus empty section under
  // real records. When there's no EHR content at all, keep the pre-Phase-2
  // behavior — render every row (missing or not) so the "Not shared" state
  // is preserved for the doctor.
  const selfRowsToRender = hasEhr && !hasSelfContent ? [] : g.rows;
  return `
<section>
  <h2 style="color:${g.color};">${escape(g.title)}</h2>
  ${
    hasEhr
      ? `${
          showBoth
            ? '<h3 style="color:#64748b; font-size:10pt; letter-spacing:0.4px; text-transform:uppercase;">From your health records</h3>'
            : ''
        }${renderRowsHtml(ehrRows)}`
      : ''
  }
  ${
    selfRowsToRender.length > 0
      ? `${
          showBoth
            ? '<h3 style="color:#64748b; font-size:10pt; letter-spacing:0.4px; text-transform:uppercase; margin-top:12px;">You added this</h3>'
            : ''
        }${renderRowsHtml(selfRowsToRender)}`
      : ''
  }
  ${g.scoreBlocks?.length ? renderScoresHtml(g.scoreBlocks) : ''}
</section>`;
}

// Strip HTML down to plain text for older binaries that don't have the
// expo-print / expo-sharing native modules linked yet. Mirrors the helper
// in ShareSummarySection so both share surfaces degrade identically.
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function ShareIntakeReportSection(): React.JSX.Element | null {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [sharing, setSharing] = useState(false);

  const { data } = usePatientIntake();
  const intake = data?.intake ?? null;
  const questions = data?.questions ?? [];

  // COS-481 Phase 2: same EHR-hydration pipeline the on-screen report uses,
  // so the shared PDF stays in lockstep with what the patient sees on device.
  // The hook internally gates on IMMUNIZATIONS_EHR_ENABLED — when the kill
  // switch is off, `.data` stays undefined and the guard below silently
  // falls back to the Phase-1 single-block card in the PDF too.
  const immunizations = useImmunizations();

  // COS-849 entitlement gate. A hook, so unconditional and above the early
  // return below. Gates the button only — `onShare` is untouched.
  const canExportPdf = useCanRender('patient-intake-report.export-pdf');

  // Nothing to share until the intake record exists.
  if (!intake) return null;

  const isComplete = intake.status === 'complete';
  const disabled = sharing || !isComplete;

  const completedAtLabel = intake.completedAt
    ? new Date(intake.completedAt).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  const buildHtml = (): string => {
    const ehrList = immunizations.data;
    const ehrRowsByGroup: EhrRowsByGroup | undefined =
      IMMUNIZATIONS_EHR_ENABLED && ehrList && ehrList.length > 0
        ? { vaccines: ehrList.map(immunizationToRow) }
        : undefined;
    const groups = buildReport(intake, questions, ehrRowsByGroup);
    return `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Health check-in</title>
<style>
  @page { margin: 0.75in; }
  body { font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #111827; font-size: 12pt; line-height: 1.45; }
  header { border-bottom: 3px solid #199C4F; padding-bottom: 12px; margin-bottom: 20px; }
  header h1 { font-size: 22pt; margin: 0 0 4px 0; color: #111827; }
  header .meta { color: #64748b; font-size: 10pt; }
  section { margin-bottom: 22px; page-break-inside: avoid; }
  section h2 { font-size: 14pt; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin: 0 0 8px 0; }
  section h3 { font-size: 11pt; margin: 12px 0 4px 0; }
  ul { padding-left: 20px; margin: 4px 0; }
  li { margin: 2px 0; }
  pre { white-space: pre-wrap; font-family: inherit; margin: 4px 0; padding: 8px; background: #f8fafc; border-radius: 6px; }
  footer { border-top: 1px solid #e2e8f0; padding-top: 10px; margin-top: 30px; color: #94a3b8; font-size: 9pt; }
</style>
</head>
<body>
  <header>
    <h1>Health check-in</h1>
    <div class="meta">Completed ${escape(completedAtLabel)} · Circle Support Health</div>
  </header>
  ${groups.map(renderGroupHtml).join('')}
  <footer>
    This is a snapshot of self-reported answers at the time of the intake. Screening scores are indicators, not diagnoses.
  </footer>
</body>
</html>`;
  };

  const shareTextFallback = async (html: string) => {
    const message = htmlToText(html);
    await Share.share(
      { message, title: 'My intake' },
      { subject: 'My intake' },
    );
  };

  const onShare = async () => {
    if (disabled) return;
    setSharing(true);
    const html = buildHtml();
    try {
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share intake',
          UTI: 'com.adobe.pdf',
        });
      } else {
        // Native module present but sharing unavailable — degrade to text.
        await shareTextFallback(html);
      }
    } catch {
      // Old binary without the expo-print/expo-sharing modules linked (or a
      // transient failure) — fall back to a plain-text share so the button
      // still works.
      try {
        await shareTextFallback(html);
      } catch {
        Alert.alert('Could not share', 'Please try again in a moment.');
      }
    } finally {
      setSharing(false);
    }
  };

  const subtitle = isComplete
    ? 'Send a PDF copy of your intake to a doctor, caregiver, or family member.'
    : 'Complete your intake to enable sharing.';

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
            Share your intake
          </Text>
          <Text
            style={{
              color: colors.subtext,
              marginTop: 2,
              fontSize: getScaledFontSize(13),
              fontWeight: getScaledFontWeight(400) as TextStyle['fontWeight'],
            }}
          >
            {subtitle}
          </Text>
        </View>
      </View>

      {canExportPdf && (
      <Pressable
        onPress={onShare}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Share intake report as PDF"
        accessibilityHint="Generates a PDF of your intake and opens the share sheet"
        accessibilityState={{ disabled }}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: ACCENT,
            opacity: disabled ? 0.7 : pressed ? 0.7 : 1,
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
      )}
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
