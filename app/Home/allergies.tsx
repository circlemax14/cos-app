import { AppWrapper } from '@/components/app-wrapper';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getColors } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';
import { fetchProviderAllergies } from '@/services/api/providers';
import type { Allergy } from '@/services/api/types';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

const CRITICALITY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: '#FFEBEE', text: '#C62828', label: 'High' },
  low: { bg: '#E8F5E9', text: '#2E7D32', label: 'Low' },
  'unable-to-assess': { bg: '#FFF3E0', text: '#E65100', label: 'Unknown' },
};

export default function AllergiesScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = getColors(settings.isDarkTheme);
  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAllergies = useCallback(async () => {
    try {
      const data = await fetchProviderAllergies();
      setAllergies(data);
    } catch {
      setAllergies([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllergies();
  }, [loadAllergies]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAllergies();
    setRefreshing(false);
  }, [loadAllergies]);

  if (isLoading) {
    return (
      <AppWrapper>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1976D2" />
        </View>
      </AppWrapper>
    );
  }

  return (
    <AppWrapper>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
      >
        <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(24), fontWeight: getScaledFontWeight(600) as any }]} accessibilityRole="header">
          Allergies
        </Text>
        <Text style={[styles.subtitle, { color: colors.secondary, fontSize: getScaledFontSize(14) }]}>
          {allergies.length} allerg{allergies.length !== 1 ? 'ies' : 'y'} from your EHR records
        </Text>

        {allergies.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: colors.card }]}>
            <IconSymbol name="exclamationmark.shield" size={getScaledFontSize(48)} color={colors.text + '60'} />
            <Text style={[styles.emptyText, { color: colors.text + '80', fontSize: getScaledFontSize(16) }]}>
              No allergies found
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.text + '60', fontSize: getScaledFontSize(14) }]}>
              Allergy data will appear here once available from your connected EHRs.
            </Text>
          </View>
        ) : (
          allergies.map((allergy) => {
            const critStyle = CRITICALITY_STYLES[allergy.criticality ?? ''] ?? CRITICALITY_STYLES['unable-to-assess'];

            return (
              <View key={allergy.id} style={[styles.card, { backgroundColor: colors.card }]}>
                {/* Header: name + badges */}
                <Text style={[styles.allergyName, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(600) as any }]}>
                  {allergy.name}
                </Text>

                <View style={styles.badgeRow}>
                  {allergy.category ? (
                    <View style={[styles.badge, { backgroundColor: '#E3F2FD' }]}>
                      <Text style={[styles.badgeText, { color: '#1565C0', fontSize: getScaledFontSize(13) }]}>
                        {allergy.category}
                      </Text>
                    </View>
                  ) : null}
                  <View style={[styles.badge, { backgroundColor: critStyle.bg }]}>
                    <Text style={[styles.badgeText, { color: critStyle.text, fontSize: getScaledFontSize(13) }]}>
                      {critStyle.label} Criticality
                    </Text>
                  </View>
                  {allergy.clinicalStatus ? (
                    <View style={[styles.badge, { backgroundColor: '#F3E5F5' }]}>
                      <Text style={[styles.badgeText, { color: '#7B1FA2', fontSize: getScaledFontSize(13) }]}>
                        {allergy.clinicalStatus}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Dates */}
                {allergy.onsetDate ? (
                  <View style={styles.infoRow}>
                    <IconSymbol name="calendar" size={getScaledFontSize(20)} color={colors.secondary} />
                    <Text style={[styles.infoText, { color: colors.secondary, fontSize: getScaledFontSize(13) }]}>
                      Onset: {allergy.onsetDate}
                    </Text>
                  </View>
                ) : null}

                {/* Reactions */}
                {allergy.reactions.length > 0 ? (
                  <View style={styles.reactionsSection}>
                    <Text style={[styles.sectionLabel, { color: colors.text, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(600) as any }]}>
                      Reactions
                    </Text>
                    {allergy.reactions.map((reaction, idx) => (
                      <View key={idx} style={styles.reactionItem}>
                        {reaction.manifestations.map((m, mIdx) => (
                          <View key={mIdx} style={[styles.manifestationBadge, { backgroundColor: '#FFF3E0' }]}>
                            <Text style={[styles.badgeText, { color: '#E65100', fontSize: getScaledFontSize(12) }]}>
                              {m}
                            </Text>
                          </View>
                        ))}
                        {reaction.severity ? (
                          <Text style={[styles.severityText, { color: colors.secondary, fontSize: getScaledFontSize(12) }]}>
                            Severity: {reaction.severity}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  contentContainer: { padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { marginBottom: 4 },
  subtitle: { marginBottom: 20 },
  emptyContainer: { alignItems: 'center', padding: 32, borderRadius: 12 },
  emptyText: { marginTop: 16, textAlign: 'center' },
  emptySubtext: { marginTop: 8, textAlign: 'center' },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  allergyName: { marginBottom: 8 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 4 },
  badgeText: { fontWeight: '600', textTransform: 'capitalize' },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 },
  infoText: { flex: 1 },
  reactionsSection: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E0E0E0' },
  sectionLabel: { marginBottom: 6 },
  reactionItem: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  manifestationBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  severityText: { alignSelf: 'center' },
  bottomPadding: { height: 40 },
});
