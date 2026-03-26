import React, { useEffect, useState, useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, Switch } from 'react-native';

import { AppWrapper } from '@/components/app-wrapper';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useFeaturePermissions } from '@/hooks/use-feature-permissions';
import { fetchAvailableServices } from '@/services/api/services';
import type { ServiceDefinition } from '@/services/api/types';
import { useAccessibility } from '@/stores/accessibility-store';
import { useSettings } from '@/stores/settings-store';

export default function ServicesScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const { settings: appSettings, toggleHealthChat } = useSettings();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const { data: permissionsData } = useFeaturePermissions();

  const [services, setServices] = useState<ServiceDefinition[]>([]);
  const [, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadServices = useCallback(async () => {
    try {
      const result = await fetchAvailableServices();
      setServices(result);
    } catch {
      setServices([]);
    }
  }, []);

  useEffect(() => {
    loadServices().finally(() => setIsLoading(false));
  }, [loadServices]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadServices();
    } catch {
      // silent fail
    } finally {
      setRefreshing(false);
    }
  }, [loadServices]);

  // Default to visible/enabled while permissions are loading
  const isVisible = (featureKey: string) => permissionsData?.[featureKey as keyof typeof permissionsData]?.enabled ?? true
  const isUnlocked = (_featureKey: string) => true // TODO: wire to purchase/subscription status
  const isPurchasable = (_featureKey: string) => true // TODO: wire to purchase/subscription status
  const getStatus = (_featureKey: string) => 'active' // TODO: wire to subscription status

  const visibleServices = services.filter((svc) => isVisible(svc.featureKey));

  const handlePurchase = (service: ServiceDefinition) => {
    // TODO: Integrate with real purchase / billing flow.
    // For now this is just a placeholder so the UI is wired up.
    console.log('[Services] Purchase requested for', service.id);
  };

  return (
    <AppWrapper>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
      >
        <Text
          style={[
            styles.title,
            {
              color: colors.text,
              fontSize: getScaledFontSize(24),
              fontWeight: getScaledFontWeight(700) as any,
            },
          ]}
        >
          Services
        </Text>
        <Text
          style={[
            styles.subtitle,
            {
              color: colors.text + '90',
              fontSize: getScaledFontSize(16),
              fontWeight: getScaledFontWeight(400) as any,
            },
          ]}
        >
          View and manage the services available on your account.
        </Text>

        {/* Feature Toggles Section */}
        <View style={[styles.section, { borderBottomColor: colors.text + '20' }]}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontSize: getScaledFontSize(18) }]}>
            App Features
          </Text>
          <View style={[styles.toggleRow, { backgroundColor: colors.background }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.toggleLabel, { color: colors.text, fontSize: getScaledFontSize(16) }]}>Health Chat</Text>
              <Text style={[styles.toggleDescription, { color: colors.text + '80', fontSize: getScaledFontSize(14) }]}>
                Enable the AI Health Chat assistant in your navigation bar.
              </Text>
            </View>
            <Switch
              value={appSettings.isHealthChatEnabled}
              onValueChange={toggleHealthChat}
              trackColor={{ false: '#767577', true: colors.tint || '#008080' }}
              thumbColor={appSettings.isHealthChatEnabled ? '#ffffff' : '#f4f3f4'}
            />
          </View>
        </View>


        {visibleServices.map((service) => {
          const unlocked = isUnlocked(service.featureKey);
          const purchasable = isPurchasable(service.featureKey);
          const status = getStatus(service.featureKey);

          let statusLabel: string | null = null;
          if (status === 'purchased') statusLabel = 'Active';
          else if (status === 'enabled') statusLabel = 'Included';
          else if (status === 'purchasable') statusLabel = 'Available to purchase';
          else if (status === 'disabled') statusLabel = 'Unavailable';

          return (
            <View
              key={service.id}
              style={[
                styles.card,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.text + '20',
                },
              ]}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleRow}>
                  <IconSymbol
                    name="bag"
                    size={getScaledFontSize(28)}
                    color={colors.tint || '#008080'}
                  />
                  <View style={styles.cardTitleText}>
                    <Text
                      style={[
                        styles.cardTitle,
                        {
                          color: colors.text,
                          fontSize: getScaledFontSize(18),
                          fontWeight: getScaledFontWeight(600) as any,
                        },
                      ]}
                    >
                      {service.title}
                    </Text>
                    {service.priceLabel && (
                      <Text
                        style={[
                          styles.price,
                          {
                            color: colors.text + '80',
                            fontSize: getScaledFontSize(14),
                            fontWeight: getScaledFontWeight(500) as any,
                          },
                        ]}
                      >
                        {service.priceLabel}
                      </Text>
                    )}
                  </View>
                </View>
                {statusLabel && (
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor: unlocked ? '#0a7ea4' : colors.text + '15',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        {
                          color: unlocked ? '#ffffff' : colors.text,
                          fontSize: getScaledFontSize(12),
                          fontWeight: getScaledFontWeight(600) as any,
                        },
                      ]}
                    >
                      {statusLabel}
                    </Text>
                  </View>
                )}
              </View>

              <Text
                style={[
                  styles.description,
                  {
                    color: colors.text + '90',
                    fontSize: getScaledFontSize(14),
                    fontWeight: getScaledFontWeight(400) as any,
                  },
                ]}
              >
                {service.description}
              </Text>

              {purchasable && (
                <TouchableOpacity
                  style={[
                    styles.ctaButton,
                    {
                      backgroundColor: colors.tint || '#008080',
                    },
                  ]}
                  onPress={() => handlePurchase(service)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.ctaText,
                      {
                        fontSize: getScaledFontSize(16),
                        fontWeight: getScaledFontWeight(600) as any,
                      },
                    ]}
                  >
                    Purchase
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {visibleServices.length === 0 && (
          <View style={styles.emptyState}>
            <Text
              style={[
                styles.emptyTitle,
                {
                  color: colors.text,
                  fontSize: getScaledFontSize(18),
                  fontWeight: getScaledFontWeight(600) as any,
                },
              ]}
            >
              No services available
            </Text>
            <Text
              style={[
                styles.emptySubtitle,
                {
                  color: colors.text + '80',
                  fontSize: getScaledFontSize(14),
                  fontWeight: getScaledFontWeight(400) as any,
                },
              ]}
            >
              Your account does not currently have any services configured.
            </Text>
          </View>
        )}
      </ScrollView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 16,
  },
  section: {
    marginBottom: 24,
    borderBottomWidth: 1,
    paddingBottom: 16,
  },
  sectionTitle: {
    marginBottom: 12,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  toggleLabel: {
    fontWeight: '600',
    marginBottom: 4,
  },
  toggleDescription: {
    fontWeight: '400',
  },
  title: {
    marginBottom: 4,
  },
  subtitle: {
    marginBottom: 24,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 8,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cardTitleText: {
    marginLeft: 12,
    flex: 1,
  },
  cardTitle: {
    marginBottom: 2,
  },
  price: {
    marginTop: 2,
  },
  description: {
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    flexShrink: 0,
  },
  statusText: {},
  ctaButton: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: '#ffffff',
  },
  emptyState: {
    marginTop: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    textAlign: 'center',
    maxWidth: 260,
  },
});

