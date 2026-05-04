import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useConnectedEhrs, type ConnectedHospital } from '@/hooks/use-connected-ehrs';
import { useFeaturePermissions } from '@/hooks/use-feature-permissions';
import { useAccessibility } from '@/stores/accessibility-store';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { ClinicStatus } from '@/services/api/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Status badge styling. The four states the backend returns map onto a
 * coloured pill — green for healthy connections, amber while syncing,
 * red when something failed, neutral while still pending.
 */
const STATUS_META: Record<ClinicStatus, { label: string; bg: string; fg: string; dot: string }> = {
  active: { label: 'Active', bg: '#E8F5E9', fg: '#1B5E20', dot: '#2E7D32' },
  syncing: { label: 'Syncing', bg: '#FFF8E1', fg: '#7A4F01', dot: '#F57C00' },
  failed: { label: 'Failed', bg: '#FFEBEE', fg: '#B71C1C', dot: '#C62828' },
  pending: { label: 'Pending', bg: '#ECEFF1', fg: '#37474F', dot: '#607D8B' },
};

/**
 * Friendly label for the EHR platform (Epic, Cerner, Athena…) — shown as
 * a small chip under the clinic name.
 */
function platformLabel(platform?: string): string | null {
  if (!platform) return null;
  const map: Record<string, string> = {
    epic: 'Epic',
    cerner: 'Cerner',
    athena: 'Athena',
    allscripts: 'Allscripts',
    veradigm: 'Veradigm',
    nextgen: 'NextGen',
  };
  return map[platform.toLowerCase()] ?? platform;
}

/**
 * "2h ago" / "3d ago" / "5 mins ago" — keep granularity coarse since
 * sync timestamps don't need precision and short strings fit the card.
 */
function timeAgo(iso?: string): string | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return null;
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/**
 * 1-2 letter initials shown in the logo placeholder when the brand
 * doesn't have a CDN image (or it 404s).
 */
function initials(name: string): string {
  const words = name.replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// ─── Components ──────────────────────────────────────────────────────────────

interface CardProps {
  hospital: ConnectedHospital;
  colors: ReturnType<typeof useTheme>;
  scale: (px: number) => number;
  weight: (w: number) => string;
}

function ClinicHeroCard({ hospital, colors, scale, weight }: CardProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  const status = hospital.status ?? 'active';
  const statusMeta = STATUS_META[status];
  const platform = platformLabel(hospital.platformType);
  const lastSync = timeAgo(hospital.lastSyncAt);

  const showLogo = hospital.logoUrl && !logoFailed;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
      accessibilityLabel={`${hospital.name}, ${statusMeta.label}`}
    >
      {/* Top row: logo + name/platform + status badge */}
      <View style={styles.cardTopRow}>
        <View style={[styles.logoWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
          {showLogo ? (
            <Image
              source={{ uri: hospital.logoUrl }}
              style={styles.logoImage}
              contentFit="contain"
              onError={() => setLogoFailed(true)}
              accessibilityLabel=""
            />
          ) : (
            <Text
              style={{
                color: colors.primary,
                fontSize: scale(18),
                fontWeight: weight(700) as 'bold',
              }}
            >
              {initials(hospital.name)}
            </Text>
          )}
        </View>

        <View style={styles.titleColumn}>
          <Text
            numberOfLines={2}
            style={{
              color: colors.text,
              fontSize: scale(17),
              fontWeight: weight(700) as 'bold',
              lineHeight: scale(22),
            }}
          >
            {hospital.name}
          </Text>
          <View style={styles.metaRow}>
            {platform && (
              <View style={[styles.platformChip, { borderColor: colors.border }]}>
                <Text style={{ color: colors.subtext, fontSize: scale(11), fontWeight: weight(600) as '600' }}>
                  {platform}
                </Text>
              </View>
            )}
            {lastSync && (
              <Text style={{ color: colors.subtext, fontSize: scale(11) }} numberOfLines={1}>
                Last sync {lastSync}
              </Text>
            )}
          </View>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: statusMeta.bg }]}>
          <View style={[styles.statusDot, { backgroundColor: statusMeta.dot }]} />
          <Text style={{ color: statusMeta.fg, fontSize: scale(11), fontWeight: weight(600) as '600' }}>
            {statusMeta.label}
          </Text>
        </View>
      </View>

      {/* Optional contact info — only render rows we actually have. */}
      {(hospital.address || hospital.phone) && (
        <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />
      )}

      {hospital.address ? (
        <View style={styles.contactRow}>
          <MaterialIcons name="location-on" size={scale(16)} color={colors.subtext} />
          <Text
            style={{ color: colors.subtext, fontSize: scale(13), flex: 1 }}
            numberOfLines={2}
          >
            {hospital.address}
            {hospital.city ? `, ${hospital.city}` : ''}
            {hospital.state ? `, ${hospital.state}` : ''}
            {hospital.zipCode ? ` ${hospital.zipCode}` : ''}
          </Text>
        </View>
      ) : null}

      {hospital.phone ? (
        <View style={styles.contactRow}>
          <MaterialIcons name="phone" size={scale(16)} color={colors.subtext} />
          <Text style={{ color: colors.subtext, fontSize: scale(13), flex: 1 }} numberOfLines={1}>
            {hospital.phone}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

interface ConnectAnotherCardProps {
  colors: ReturnType<typeof useTheme>;
  scale: (px: number) => number;
  weight: (w: number) => string;
  onPress: () => void;
}

function ConnectAnotherCard({ colors, scale, weight, onPress }: ConnectAnotherCardProps) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: colors.primary + '20' }}
      style={({ pressed }) => [
        styles.connectCard,
        {
          backgroundColor: colors.primary + '0F',
          borderColor: colors.primary + '40',
          opacity: pressed ? 0.85 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Connect another EHR"
    >
      <View style={[styles.connectIcon, { backgroundColor: colors.primary + '1F' }]}>
        <MaterialIcons name="add" size={scale(22)} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: colors.primary,
            fontSize: scale(15),
            fontWeight: weight(700) as 'bold',
          }}
        >
          Connect another EHR
        </Text>
        <Text
          style={{
            color: colors.subtext,
            fontSize: scale(12),
            marginTop: 2,
          }}
          numberOfLines={1}
        >
          Add Aetna, MyChart, Kaiser, and more
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={scale(22)} color={colors.primary} />
    </Pressable>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

type ThemeColors = (typeof Colors)['light'];

function useTheme(): ThemeColors {
  const { settings } = useAccessibility();
  return Colors[settings.isDarkTheme ? 'dark' : 'light'];
}

export default function ConnectedEhrsScreen() {
  const { settings, getScaledFontWeight, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const scale = getScaledFontSize;
  const weight = (w: number) => getScaledFontWeight(w) as unknown as string;

  const { connectedHospitals, isLoadingClinics, refreshConnectedEhrs } = useConnectedEhrs();
  const { data: permissions } = useFeaturePermissions();
  const canConnectClinic = permissions?.CONNECT_CLINIC?.enabled === true;

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await refreshConnectedEhrs();
    setRefreshing(false);
  }, [refreshConnectedEhrs]);

  return (
    <AppWrapper>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text
            style={{
              color: colors.text,
              fontSize: scale(26),
              fontWeight: weight(700) as 'bold',
            }}
            accessibilityRole="header"
          >
            Connected EHRs
          </Text>
          <Text
            style={{
              color: colors.subtext,
              fontSize: scale(13),
              marginTop: 4,
            }}
          >
            {isLoadingClinics
              ? 'Loading your connections…'
              : connectedHospitals.length === 0
                ? 'No connections yet'
                : `${connectedHospitals.length} connected`}
          </Text>
        </View>

        {/* Loading */}
        {isLoadingClinics && connectedHospitals.length === 0 ? (
          <View style={styles.loadingPad}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : null}

        {/* Empty state */}
        {!isLoadingClinics && connectedHospitals.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ fontSize: 44, marginBottom: 12 }}>🏥</Text>
            <Text
              style={{
                color: colors.text,
                fontSize: scale(16),
                fontWeight: weight(700) as 'bold',
                textAlign: 'center',
                marginBottom: 6,
              }}
            >
              No connected clinics yet
            </Text>
            <Text
              style={{
                color: colors.subtext,
                fontSize: scale(13),
                textAlign: 'center',
                lineHeight: scale(18),
              }}
            >
              Connect your first EHR to securely import your medical history.
            </Text>
          </View>
        ) : null}

        {/* Clinic cards */}
        {connectedHospitals.map((hospital) => (
          <ClinicHeroCard
            key={hospital.id}
            hospital={hospital}
            colors={colors}
            scale={scale}
            weight={weight}
          />
        ))}

        {/* Connect another EHR — hidden for users with the feature flag off */}
        {canConnectClinic && (
          <ConnectAnotherCard
            colors={colors}
            scale={scale}
            weight={weight}
            onPress={() => router.push('/Home/connect-clinics')}
          />
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </AppWrapper>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  header: { marginBottom: 16, paddingHorizontal: 4 },

  // Hero card
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  logoWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: { width: 40, height: 40 },
  titleColumn: { flex: 1, minWidth: 0 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  platformChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    flexShrink: 0,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  cardDivider: { height: 1, marginVertical: 12 },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },

  // Connect-another card
  connectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: 14,
  },
  connectIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // States
  loadingPad: { paddingVertical: 32, alignItems: 'center' },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    marginBottom: 12,
  },
});
