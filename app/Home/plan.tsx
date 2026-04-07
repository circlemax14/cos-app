import React from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useHealthSummary } from '@/hooks/use-health-summary';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface SectionCardProps {
  icon: string;
  iconColor: string;
  title: string;
  content: unknown;
  colors: any;
  getScaledFontSize: (size: number) => number;
  getScaledFontWeight: (weight: number) => string;
}

function formatContent(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    // Handle objects like { "Oxygen Saturation": "...", "Weight": "..." }
    return Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => `${key}: ${typeof val === 'string' ? val : JSON.stringify(val)}`)
      .join('\n\n');
  }
  return String(value);
}

function SectionCard({ icon, iconColor, title, content, colors, getScaledFontSize, getScaledFontWeight }: SectionCardProps) {
  const displayContent = formatContent(content);
  if (!displayContent) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.iconCircle, { backgroundColor: iconColor + '15' }]}>
          <MaterialIcons name={icon as any} size={getScaledFontSize(22)} color={iconColor} />
        </View>
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(17),
            fontWeight: getScaledFontWeight(600) as any,
            flex: 1,
          }}
          accessibilityRole="header"
        >
          {title}
        </Text>
      </View>
      <Text
        style={{
          color: colors.text,
          fontSize: getScaledFontSize(15),
          lineHeight: getScaledFontSize(22),
        }}
      >
        {displayContent}
      </Text>
    </View>
  );
}

export default function HealthSummaryScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const { data, isLoading, isError, refetch, isRefetching } = useHealthSummary();

  if (isLoading) {
    return (
      <AppWrapper>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14), marginTop: 12 }}>
            Loading your health summary...
          </Text>
        </View>
      </AppWrapper>
    );
  }

  if (isError) {
    return (
      <AppWrapper>
        <View style={styles.centered}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🩺</Text>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(16),
              fontWeight: getScaledFontWeight(600) as any,
              marginBottom: 8,
              textAlign: 'center',
            }}
          >
            Unable to load health summary
          </Text>
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(14),
              marginBottom: 20,
              textAlign: 'center',
            }}
          >
            Please check your connection and try again.
          </Text>
          <TouchableOpacity
            onPress={() => refetch()}
            style={[styles.retryButton, { backgroundColor: colors.tint }]}
            accessibilityRole="button"
            accessibilityLabel="Retry loading health summary"
          >
            <Text
              style={{
                color: '#fff',
                fontSize: getScaledFontSize(16),
                fontWeight: getScaledFontWeight(600) as any,
              }}
            >
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      </AppWrapper>
    );
  }

  return (
    <AppWrapper>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={colors.tint}
          />
        }
      >
        {/* Header */}
        <View style={styles.headerSection}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🩺</Text>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(22),
              fontWeight: getScaledFontWeight(700) as any,
              textAlign: 'center',
              marginBottom: 4,
            }}
            accessibilityRole="header"
          >
            Health Summary
          </Text>
          {data?.generatedAt && (
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(13),
                textAlign: 'center',
              }}
            >
              Last updated: {new Date(data.generatedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </Text>
          )}
        </View>

        {/* Overview */}
        <SectionCard
          icon="summarize"
          iconColor="#0D9488"
          title="Overview"
          content={data?.overview ?? ''}
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        />

        {/* Conditions */}
        <SectionCard
          icon="medical-information"
          iconColor="#D97706"
          title="Conditions"
          content={data?.conditions ?? ''}
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        />

        {/* Medications */}
        <SectionCard
          icon="medication"
          iconColor="#2563EB"
          title="Medications"
          content={data?.medications ?? ''}
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        />

        {/* Recent Labs */}
        <SectionCard
          icon="science"
          iconColor="#7C3AED"
          title="Recent Labs"
          content={data?.recentLabs ?? ''}
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        />

        {/* Recommendations */}
        <SectionCard
          icon="tips-and-updates"
          iconColor="#059669"
          title="Recommendations"
          content={data?.recommendations ?? ''}
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
        />

        {!data?.overview && !data?.conditions && !data?.medications && !data?.recentLabs && !data?.recommendations && (
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>📋</Text>
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(16),
                fontWeight: getScaledFontWeight(600) as any,
                textAlign: 'center',
                marginBottom: 6,
              }}
            >
              No health summary available yet
            </Text>
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(14),
                textAlign: 'center',
              }}
            >
              Your health summary will appear here once your health data has been processed.
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  retryButton: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
});
