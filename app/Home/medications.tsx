import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Card } from 'react-native-paper';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { fetchMedicationsSummary } from '@/services/api/patient';
import type { MedicationSummary } from '@/services/api/types';
import { inferMedicationStatus } from '@/utils/treatment-status';
import { MedicationsSection } from '@/components/health-plan/MedicationsSection';
import { MedicationsReviewPrompt } from '@/components/health-plan/MedicationsReviewPrompt';
import { TodaysMedicationsCard } from '@/components/health-plan/TodaysMedicationsCard';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function MedicationsScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const [meds, setMeds] = useState<MedicationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await fetchMedicationsSummary({ includePast: true });
      setMeds(data);
    } catch {
      setError('Unable to load your medications. Pull to retry.');
      setMeds([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { active, past } = useMemo(() => {
    const a: MedicationSummary[] = [];
    const p: MedicationSummary[] = [];
    for (const m of meds) {
      const code = inferMedicationStatus(m).code;
      if (code === 'active' || code === 'on-hold') a.push(m);
      else p.push(m);
    }
    return { active: a, past: p };
  }, [meds]);

  return (
    <AppWrapper>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.text} />}
      >
        {/*
          SCRUM-658 (2026-07-31): back button + inline header. Same
          shape as SCRUM-656 fix on /Home/bps-progress + /Home/wellbeing-map
          — Pressable + arrow-back MaterialIcon + router.replace to the
          Plan (BPS) route so the destination is deterministic even
          when the user got here via tab-switch (which doesn't push
          onto the router history).
        */}
        <View style={styles.backHeaderRow}>
          <Pressable
            onPress={() => router.replace('/Home/biopsychosocial-plan' as never)}
            style={styles.backBtn}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back to care plan"
          >
            <MaterialIcons name="arrow-back" size={getScaledFontSize(24)} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.header}>
          <Text
            style={[
              styles.title,
              { color: colors.text, fontSize: getScaledFontSize(28), fontWeight: getScaledFontWeight(700) as any },
            ]}
          >
            Medications
          </Text>
          <Text
            style={[
              styles.subtitle,
              { color: colors.subtext, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(400) as any },
            ]}
          >
            {loading ? 'Loading…' : `${active.length} active · ${past.length} past`}
          </Text>
        </View>

        {/*
          SCRUM-658 (2026-07-31): plan-driven meds moved from BPS surface
          to this route:
            1. TodaysMedicationsCard — today's dose preview
            2. MedicationsReviewPrompt — soft "review your meds" prompt
            3. MedicationsSection — full editor with add/edit/delete
          All three components self-guard on the server flagEnabled +
          load state; on plans without meds they null-render and this
          screen falls through to the read-only fetchMedicationsSummary
          view below unchanged.
        */}
        <TodaysMedicationsCard
          colors={colors as unknown as Record<string, string>}
          isDark={settings.isDarkTheme}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        />
        <MedicationsReviewPrompt onReviewNow={() => undefined} />
        <MedicationsSection openAddSignal={0} />

        {error && (
          <View style={styles.errorCard}>
            <MaterialIcons name="error-outline" size={getScaledFontSize(20)} color="#DC2626" />
            <Text style={[styles.errorText, { fontSize: getScaledFontSize(13) }]}>{error}</Text>
          </View>
        )}

        {loading && !refreshing ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.tint} />
          </View>
        ) : meds.length === 0 ? (
          <View style={styles.centered}>
            <MaterialIcons name="medication" size={getScaledFontSize(48)} color={colors.subtext} />
            <Text
              style={[
                styles.emptyTitle,
                { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any },
              ]}
            >
              No medications recorded yet
            </Text>
            <Text
              style={[
                styles.emptyBody,
                { color: colors.subtext, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(400) as any },
              ]}
            >
              Connect a clinic from the Profile screen so we can pull your prescriptions here.
            </Text>
          </View>
        ) : (
          <>
            <Section
              title="Active"
              count={active.length}
              accent="#16A34A"
              meds={active}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
              emptyText="No active prescriptions on file."
            />
            <Section
              title="Past"
              count={past.length}
              accent="#6B7280"
              meds={past}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
              emptyText="No past medications on file."
            />
          </>
        )}
      </ScrollView>
    </AppWrapper>
  );
}

interface SectionProps {
  title: string;
  count: number;
  accent: string;
  meds: MedicationSummary[];
  colors: (typeof Colors)['light'];
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
  emptyText: string;
}

function Section({ title, count, accent, meds, colors, getScaledFontSize, getScaledFontWeight, emptyText }: SectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionDot, { backgroundColor: accent }]} />
        <Text
          style={[
            styles.sectionTitle,
            { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(700) as any },
          ]}
        >
          {title}
        </Text>
        <Text
          style={[
            styles.sectionCount,
            { color: colors.subtext, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(500) as any },
          ]}
        >
          · {count}
        </Text>
      </View>
      {meds.length === 0 ? (
        <Text
          style={[
            styles.sectionEmpty,
            { color: colors.subtext, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(400) as any },
          ]}
        >
          {emptyText}
        </Text>
      ) : (
        meds.map((m) => (
          <MedRow
            key={m.id}
            med={m}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
          />
        ))
      )}
    </View>
  );
}

interface MedRowProps {
  med: MedicationSummary;
  colors: (typeof Colors)['light'];
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}

function MedRow({ med, colors, getScaledFontSize, getScaledFontWeight }: MedRowProps) {
  const statusStyle = inferMedicationStatus(med);
  const showSig = (med.dosage || med.frequency || med.rawDosageText) ?? '';
  const isActiveLike = statusStyle.code === 'active' || statusStyle.code === 'on-hold';
  return (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.cardTopRow}>
          <Text
            style={[
              styles.medName,
              { color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(700) as any },
            ]}
            numberOfLines={2}
          >
            {med.name}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text
              style={[
                styles.statusText,
                { color: statusStyle.fg, fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(700) as any },
              ]}
            >
              {statusStyle.label}
            </Text>
          </View>
        </View>
        {(med.dosage || med.frequency) && (
          <Text
            style={[
              styles.medSig,
              { color: colors.text, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(500) as any },
            ]}
            numberOfLines={2}
          >
            {[med.dosage, med.frequency].filter(Boolean).join(' · ')}
          </Text>
        )}
        {!med.dosage && !med.frequency && med.rawDosageText && (
          <Text
            style={[
              styles.medSig,
              { color: colors.subtext, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(400) as any },
            ]}
            numberOfLines={3}
          >
            {med.rawDosageText}
          </Text>
        )}
        {med.authoredOn && (
          <Text
            style={[
              styles.medMeta,
              { color: colors.subtext, fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(400) as any },
            ]}
          >
            {isActiveLike ? 'Started' : 'Last filled'}{' '}{formatDate(med.authoredOn)}
          </Text>
        )}
        {!showSig && !med.authoredOn && (
          <Text
            style={[
              styles.medMeta,
              { color: colors.subtext, fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(400) as any },
            ]}
          >
            Dosage details not on file
          </Text>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  backHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
    marginLeft: -8,
  },
  backBtn: {
    padding: 8,
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  header: { marginBottom: 14 },
  title: { letterSpacing: -0.4 },
  subtitle: { marginTop: 4, letterSpacing: 0.2 },
  centered: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
  emptyTitle: { textAlign: 'center', marginTop: 12 },
  emptyBody: { textAlign: 'center', maxWidth: 280, lineHeight: 18 },
  errorCard: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    alignItems: 'center',
  },
  errorText: { color: '#991B1B', flex: 1 },
  section: { marginTop: 8 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: {},
  sectionCount: {},
  sectionEmpty: { paddingVertical: 12, paddingHorizontal: 4 },
  card: { marginBottom: 8 },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  medName: { flex: 1, lineHeight: 20 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { letterSpacing: 0.4 },
  medSig: { marginTop: 6 },
  medMeta: { marginTop: 4 },
});
