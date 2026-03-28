import { DoctorCard } from '@/components/ui/doctor-card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { router } from 'expo-router';
import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Button, Menu, Portal, Text, TextInput as PaperTextInput } from 'react-native-paper';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Tabs, TabScreen, TabsProvider } from 'react-native-paper-tabs';
import { fetchProviders } from '@/services/api/providers';
import type { Provider } from '@/services/api/types';
import { getAllCategories, getAllMedicalSubcategories, groupProvidersByCategory, getProvidersByCategory, getProvidersByMedicalSubcategory } from '@/services/provider-categorization';
import { SUPPORT_CATEGORIES, getCategoryById, matchProviderToSubCategory } from '@/constants/categories';
import { getAllCareManagerAgencies, searchCareManagerAgencies, type CareManagerAgency } from '@/services/care-manager-agencies';
import { FilterMenu } from '@/components/ui/filter-menu';
import { MAX_SELECTED_PROVIDERS, useProviderSelection, type SelectedProvider } from '@/stores/provider-selection-store';
import { useDoctorPhotos } from '@/hooks/use-doctor-photo';
import * as DocumentPicker from 'expo-document-picker';
import {
  getNonEhrProviders,
  processAndStoreFiles,
  clearAllNonEhrData,
  type NonEhrProvider,
  type NonEhrFile
} from '@/services/non-ehr-processor';
import { ActivityIndicator as RNActivityIndicator, Alert } from 'react-native';


interface CategoryGroup {
  id: string;
  name: string;
  doctors: Provider[];
  subCategories?: SubCategoryGroup[];
  icon?: string;
}

interface SubCategoryGroup {
  id: string;
  name: string;
  doctors: Provider[];
  icon?: string;
}

type ManualMember = {
  id: string;
  name: string;
  relationship?: string;
  phone?: string;
  email?: string;
  categoryId: string;
  subCategoryId: string;
};

export default function ModalScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const { selectedProviders, selectedCareManager, addProvider, removeProvider, setSelectedCareManager } = useProviderSelection();
  const [categoryGroups, setCategoryGroups] = React.useState<CategoryGroup[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string | null>(null);
  const [lastVisitedFilter, setLastVisitedFilter] = React.useState<string | null>(null);
  const [manualMembersBySubCategory, setManualMembersBySubCategory] = React.useState<Record<string, ManualMember[]>>({});
  const [openManualFormKey, setOpenManualFormKey] = React.useState<string | null>(null);
  const [manualName, setManualName] = React.useState('');
  const [manualRelationship, setManualRelationship] = React.useState('');
  const [manualPhone, setManualPhone] = React.useState('');
  const [manualEmail, setManualEmail] = React.useState('');
  const [manualSubCategoryId, setManualSubCategoryId] = React.useState<string | null>(null);
  const [isSubCategoryMenuVisible, setIsSubCategoryMenuVisible] = React.useState(false);
  const [providerSearchQuery, setProviderSearchQuery] = React.useState('');
  const [agencySearchQuery, setAgencySearchQuery] = React.useState('');
  const [agencies, setAgencies] = React.useState<CareManagerAgency[]>([]);
  const [integrativeSearchQuery, setIntegrativeSearchQuery] = React.useState('');
  const [nonEhrProviders, setNonEhrProviders] = React.useState<NonEhrProvider[]>([]);
  const [isUploadingIntegrative, setIsUploadingIntegrative] = React.useState(false);

  // Load care manager agencies from API
  React.useEffect(() => {
    const loadAgencies = async () => {
      const data = agencySearchQuery.trim()
        ? await searchCareManagerAgencies(agencySearchQuery)
        : await getAllCareManagerAgencies();
      setAgencies(data);
    };
    loadAgencies();
  }, [agencySearchQuery]);

  // Collect all provider IDs from category groups to load photos
  const allProviderIds = React.useMemo(() => {
    const ids: string[] = [];
    categoryGroups.forEach(category => {
      category.subCategories?.forEach(subCategory => {
        subCategory.doctors.forEach(doctor => {
          if (doctor.id && !ids.includes(doctor.id)) {
            ids.push(doctor.id);
          }
        });
      });
    });
    return ids;
  }, [categoryGroups]);

  // Load doctor photos for all providers
  const doctorPhotos = useDoctorPhotos(allProviderIds);

  const lastVisitedFilters = [
    { id: '3m', label: 'Last 3 months', months: 3 },
    { id: '6m', label: 'Last 6 months', months: 6 },
    { id: '1y', label: 'Last 1 year', years: 1 },
    { id: '2y', label: 'Last 2 years', years: 2 },
    { id: '5y', label: 'Last 5 years', years: 5 },
  ];

  const getCutoffDate = (filterId: string | null) => {
    if (!filterId) return null;
    const filter = lastVisitedFilters.find(item => item.id === filterId);
    if (!filter) return null;
    const now = new Date();
    const cutoff = new Date(now);
    if (filter.months) {
      cutoff.setMonth(now.getMonth() - filter.months);
    } else if (filter.years) {
      cutoff.setFullYear(now.getFullYear() - filter.years);
    }
    return cutoff;
  };

  const filterProvidersByLastVisited = (providers: SelectedProvider[]) => {
    if (!lastVisitedFilter) return providers;
    const cutoff = getCutoffDate(lastVisitedFilter);
    if (!cutoff) return providers;
    return providers.filter(provider => {
      if (provider.isManual) return true;
      if (provider.category && provider.category !== 'Medical') return true;
      if (!provider.lastVisited) return false;
      const visitedDate = new Date(provider.lastVisited);
      return visitedDate >= cutoff;
    });
  };

  const getSubCategoryKey = (categoryId: string, subCategoryId: string) =>
    `${categoryId}-${subCategoryId}`;

  const handleAddManualMember = (categoryId: string, subCategoryId: string) => {
    const trimmedName = manualName.trim();
    if (!trimmedName) return;
    const targetSubCategoryId = manualSubCategoryId || subCategoryId;
    const key = getSubCategoryKey(categoryId, targetSubCategoryId);
    const newMember: ManualMember = {
      id: `manual-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: trimmedName,
      relationship: manualRelationship.trim() || undefined,
      phone: manualPhone.trim() || undefined,
      email: manualEmail.trim() || undefined,
      categoryId,
      subCategoryId: targetSubCategoryId,
    };
    setManualMembersBySubCategory(prev => ({
      ...prev,
      [key]: [...(prev[key] || []), newMember],
    }));
    setManualName('');
    setManualRelationship('');
    setManualPhone('');
    setManualEmail('');
    setManualSubCategoryId(null);
    setOpenManualFormKey(null);
  };

  const closeModal = () => {
    router.back();
  };

  const selectedProviderIds = React.useMemo(
    () => new Set(selectedProviders.map(provider => String(provider.id))),
    [selectedProviders]
  );
  const isCircleFull = selectedProviders.length >= MAX_SELECTED_PROVIDERS;

  // Load and categorize providers from Fasten Health
  React.useEffect(() => {
    const loadAndCategorizeProviders = async () => {
      setIsLoading(true);
      try {
        const providers = await fetchProviders();

        // Use the same categorization logic as ListView for consistency
        const categorizedProviders = new Map<string, Provider[]>();

        // Categorize each provider (can belong to multiple subcategories)
        providers.forEach(provider => {
          const categoryMatch = provider.category
            ? SUPPORT_CATEGORIES.find(cat => cat.name === provider.category)
            : undefined;
          const subCategoryNames = provider.subCategories && provider.subCategories.length > 0
            ? provider.subCategories
            : provider.subCategory
              ? [provider.subCategory]
              : [];

          const categorizedViaProvider = categoryMatch && subCategoryNames.length > 0
            ? subCategoryNames
              .map(subName => {
                const subMatch = categoryMatch.subCategories.find(sub => sub.name === subName);
                return subMatch ? { categoryId: categoryMatch.id, subCategoryId: subMatch.id } : null;
              })
              .filter((match): match is { categoryId: string; subCategoryId: string } => Boolean(match))
            : [];

          const matches = categorizedViaProvider.length > 0
            ? categorizedViaProvider
            : (matchProviderToSubCategory(
              provider.name,
              provider.specialty,
              provider.qualifications
            ) || []);

          if (matches.length > 0) {
            // Add provider to ALL applicable subcategories
            matches.forEach(match => {
              const key = `${match.categoryId}-${match.subCategoryId}`;
              if (!categorizedProviders.has(key)) {
                categorizedProviders.set(key, []);
              }
              categorizedProviders.get(key)!.push(provider);
            });
          }
        });

        const categories: CategoryGroup[] = SUPPORT_CATEGORIES.map(categoryDef => {
          const subCategories: SubCategoryGroup[] = categoryDef.subCategories.map(subCatDef => {
            const key = `${categoryDef.id}-${subCatDef.id}`;
            const providers = categorizedProviders.get(key) || [];
            return {
              id: subCatDef.id,
              name: subCatDef.name,
              doctors: providers,
              icon: subCatDef.icon,
            };
          });

          return {
            id: categoryDef.id,
            name: categoryDef.name,
            doctors: [],
            subCategories,
            icon: categoryDef.icon,
          };
        });

        setCategoryGroups(categories);
        console.log(`Loaded ${categories.length} categories with providers using same logic as ListView`);

        // Load non-EHR (Integrative) providers
        const nonEhr = await getNonEhrProviders();
        setNonEhrProviders(nonEhr);
      } catch (error) {
        console.error('Error loading and categorizing providers:', error);
        setCategoryGroups([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadAndCategorizeProviders();
  }, []);

  const handleIntegrativeUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'image/*',
          'text/plain',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ],
        multiple: true,
      });

      if (result.canceled || !result.assets.length) return;

      setIsUploadingIntegrative(true);

      // Process the files (extracts clinic/provider via AI, sequential to avoid rate limits)
      const results = await processAndStoreFiles(result.assets.map(asset => ({
        uri: asset.uri,
        mimeType: asset.mimeType || 'application/octet-stream',
        name: asset.name,
        size: asset.size || 0,
      })));

      // Count how many files were actually added (vs duplicates)
      const addedCount = results.filter(r => r.added).length;
      const dupCount = results.filter(r => r.isDuplicate).length;

      // Collect unique provider names created/updated
      const allProviderNames = [...new Set(
        results.flatMap(r => r.providers.map(p => p.providerName))
      )];

      if (addedCount > 0) {
        // Refresh the list
        const updated = await getNonEhrProviders();
        setNonEhrProviders(updated);
        const summary = allProviderNames.length > 0
          ? `Added ${addedCount} file(s) under: ${allProviderNames.join(', ')}.`
          : `Added ${addedCount} file(s).`;
        Alert.alert('Success', summary + (dupCount > 0 ? `\n${dupCount} duplicate(s) skipped.` : ''));
      } else if (dupCount > 0) {
        Alert.alert('Already Uploaded', `All ${dupCount} file(s) were already uploaded.`);
      } else {
        Alert.alert('Error', 'Could not extract information from these files.');
      }
    } catch (err) {
      console.error('[Modal] Integrative upload error:', err);
      Alert.alert('Error', 'Failed to upload document.');
    } finally {
      setIsUploadingIntegrative(false);
    }
  };

  const handleResetIntegrativeData = () => {
    Alert.alert(
      'Reset All Integrative Data',
      'This will delete ALL uploaded files and providers. Use this to clear test data before re-uploading.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await clearAllNonEhrData();
            setNonEhrProviders([]);
            Alert.alert('Reset complete', 'All integrative data cleared. You can now re-upload.');
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Portal.Host>
        <View style={styles.modalHeader}>
          <View style={styles.headerActionsLeft}>
            <FilterMenu
              options={lastVisitedFilters}
              selectedId={lastVisitedFilter}
              onSelect={setLastVisitedFilter}
              onClear={() => setLastVisitedFilter(null)}
              color={colors.text}
              menuBackgroundColor={colors.background}
              menuTextColor={colors.text}
              menuHighlightColor={colors.tint + '20'}
              fontSize={getScaledFontSize(14)}
              fontWeight={getScaledFontWeight(500) as any}
              iconSize={getScaledFontSize(22)}
              accessibilityLabel="Filter providers by last visited"
            />
          </View>
          <Text style={[styles.modalTitle, {
            fontSize: getScaledFontSize(20),
            fontWeight: getScaledFontWeight(600) as any,
            color: colors.text
          }]}>SUPPORTS</Text>
          <View style={styles.headerActionsRight}>
            <TouchableOpacity onPress={closeModal} style={styles.headerAction}>
              <IconSymbol name="xmark" size={getScaledFontSize(24)} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.tint} />
            <Text style={[styles.loadingText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]}>
              Loading providers...
            </Text>
          </View>
        ) : categoryGroups.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }]}>
              No providers available
            </Text>
          </View>
        ) : (
          <TabsProvider
            defaultIndex={0}
            onChangeIndex={(index) => {
              // Reset selected category when switching tabs
              setSelectedCategoryId(null);
              setOpenManualFormKey(null);
              setManualSubCategoryId(null);
              setProviderSearchQuery(''); // Reset search when switching categories
              setAgencySearchQuery(''); // Reset agency search when switching categories
            }}
          >
            <Tabs
              showLeadingSpace={false}
              showTextLabel={true}
              uppercase={true}
              mode="scrollable"
              tabLabelStyle={{
                fontSize: getScaledFontSize(14),
                fontWeight: getScaledFontWeight(500) as any,
                color: colors.text,
                paddingHorizontal: Math.max(8, getScaledFontSize(14) / 2),
                textAlign: 'center',
                lineHeight: getScaledFontSize(20)
              }}
              tabHeaderStyle={{
                backgroundColor: colors.background,
                borderBottomColor: colors.text + '20',
                borderBottomWidth: 1,
              }}
              style={{ backgroundColor: colors.background }}
              dark={settings.isDarkTheme}
            >
              {categoryGroups.map((category) => {
                const isNonMedicalCategory = category.id !== 'medical';
                const subCategories = category.subCategories || [];
                const subCategoriesWithData = subCategories.filter(subCategory => {
                  const key = getSubCategoryKey(category.id, subCategory.id);
                  const providers = subCategory.doctors || [];
                  const manualMembers = manualMembersBySubCategory[key] || [];
                  return providers.length + manualMembers.length > 0;
                });
                const subCategoriesToShow = isNonMedicalCategory ? subCategoriesWithData : subCategories;
                const showEmptyNonMedical = isNonMedicalCategory && subCategoriesWithData.length === 0;
                const emptyFormKey = `category-${category.id}`;
                const manualSubCategoryLabel = manualSubCategoryId
                  ? subCategories.find(sub => sub.id === manualSubCategoryId)?.name
                  : undefined;

                // Handle Care Manager category specially - show agencies directly
                if (category.id === 'care-manager') {
                  return (
                    <TabScreen
                      key={category.id}
                      label={category.name}
                    >
                      <ScrollView contentContainerStyle={styles.cardsContainer}>
                        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                          <PaperTextInput
                            label="Search agencies"
                            value={agencySearchQuery}
                            onChangeText={setAgencySearchQuery}
                            mode="outlined"
                            left={<PaperTextInput.Icon icon={() => <MaterialIcons name="search" size={getScaledFontSize(20)} color={colors.text + '80'} />} />}
                            style={{ backgroundColor: colors.background }}
                            textColor={colors.text}
                            activeOutlineColor={colors.tint}
                          />
                        </View>
                        {agencies.length === 0 ? (
                          <View style={styles.emptyDepartmentContainer}>
                            <Text style={[
                              styles.emptyText,
                              {
                                color: colors.text,
                                fontSize: getScaledFontSize(14),
                                fontWeight: getScaledFontWeight(500) as any,
                              }
                            ]}>
                              No agencies found
                            </Text>
                          </View>
                        ) : (
                          agencies.map((agency) => (
                            <TouchableOpacity
                              key={agency.id}
                              style={[
                                styles.listItem,
                                {
                                  borderBottomColor: colors.text + '20',
                                  paddingVertical: getScaledFontSize(16),
                                  paddingHorizontal: getScaledFontSize(16),
                                  marginBottom: getScaledFontSize(12),
                                  borderRadius: getScaledFontSize(12),
                                  backgroundColor: colors.background,
                                }
                              ]}
                              onPress={() => {
                                const isSelected = selectedCareManager?.id === agency.id;
                                if (isSelected) {
                                  setSelectedCareManager(null);
                                } else {
                                  setSelectedCareManager({ id: agency.id, name: agency.name, agencyName: agency.name, logoUrl: agency.logoUrl });
                                }
                              }}
                              activeOpacity={0.7}
                            >
                              <View style={[
                                styles.listAvatar,
                                {
                                  width: getScaledFontSize(56),
                                  height: getScaledFontSize(56),
                                  borderRadius: getScaledFontSize(28),
                                  backgroundColor: colors.tint + '20',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }
                              ]}>
                                <IconSymbol name={(category.icon as any) || 'building.2'} size={getScaledFontSize(28)} color={colors.tint || '#008080'} />
                              </View>
                              <View style={[styles.listItemContent, { marginLeft: getScaledFontSize(16), flex: 1 }]}>
                                <Text style={[
                                  styles.listItemName,
                                  {
                                    fontSize: getScaledFontSize(16),
                                    fontWeight: getScaledFontWeight(600) as any,
                                    color: colors.text,
                                    marginBottom: getScaledFontSize(4),
                                  }
                                ]}>
                                  {agency.name}
                                </Text>
                                <Text style={[
                                  styles.listItemRole,
                                  {
                                    fontSize: getScaledFontSize(14),
                                    fontWeight: getScaledFontWeight(400) as any,
                                    color: colors.text + '80',
                                  }
                                ]} numberOfLines={2}>
                                  {agency.description}
                                </Text>
                                {agency.city && agency.state && (
                                  <Text style={[
                                    styles.listItemRole,
                                    {
                                      fontSize: getScaledFontSize(12),
                                      fontWeight: getScaledFontWeight(400) as any,
                                      color: colors.text + '60',
                                      marginTop: getScaledFontSize(4),
                                    }
                                  ]}>
                                    {agency.city}, {agency.state}
                                  </Text>
                                )}
                              </View>
                              {(() => {
                                const isSelected = selectedCareManager?.id === agency.id;
                                return (
                                  <View style={{
                                    width: getScaledFontSize(32),
                                    height: getScaledFontSize(32),
                                    borderRadius: getScaledFontSize(16),
                                    backgroundColor: isSelected ? '#EF4444' + '20' : colors.tint + '20',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}>
                                    <IconSymbol name={isSelected ? 'minus' : 'plus'} size={getScaledFontSize(18)} color={isSelected ? '#EF4444' : colors.tint} />
                                  </View>
                                );
                              })()}
                            </TouchableOpacity>
                          ))
                        )}
                      </ScrollView>
                    </TabScreen>
                  );
                }

                // Handle Integrative category - show non-EHR providers and upload button
                if (category.id === 'integrative') {
                  let filteredIntegrative = nonEhrProviders;
                  if (integrativeSearchQuery.trim()) {
                    const query = integrativeSearchQuery.toLowerCase().trim();
                    filteredIntegrative = nonEhrProviders.filter(p =>
                      p.providerName.toLowerCase().includes(query) ||
                      p.clinicName.toLowerCase().includes(query) ||
                      (p.specialty && p.specialty.toLowerCase().includes(query))
                    );
                  }

                  return (
                    <TabScreen
                      key={category.id}
                      label={category.name}
                    >
                      <ScrollView contentContainerStyle={styles.cardsContainer}>
                        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                          <Button
                            mode="contained"
                            onPress={handleIntegrativeUpload}
                            disabled={isUploadingIntegrative}
                            icon={() => <MaterialIcons name="upload-file" size={getScaledFontSize(20)} color="#fff" />}
                            buttonColor={colors.tint}
                            style={{ marginBottom: 8 }}
                          >
                            {isUploadingIntegrative ? 'Processing...' : 'Upload Record'}
                          </Button>
                          <Button
                            mode="outlined"
                            onPress={handleResetIntegrativeData}
                            icon={() => <MaterialIcons name="delete-sweep" size={getScaledFontSize(18)} color="#e53935" />}
                            textColor="#e53935"
                            style={{ marginBottom: 16, borderColor: '#e5393540' }}
                          >
                            Reset All Data
                          </Button>

                          <PaperTextInput
                            label="Search providers"
                            value={integrativeSearchQuery}
                            onChangeText={setIntegrativeSearchQuery}
                            mode="outlined"
                            left={<PaperTextInput.Icon icon={() => <MaterialIcons name="search" size={getScaledFontSize(20)} color={colors.text + '80'} />} />}
                            style={{ backgroundColor: colors.background }}
                            textColor={colors.text}
                            activeOutlineColor={colors.tint}
                          />

                          {isUploadingIntegrative && (
                            <View style={{ marginTop: 16, alignItems: 'center', gap: 8 }}>
                              <RNActivityIndicator size="small" color={colors.tint} />
                              <Text style={{ color: colors.text + '70', fontSize: getScaledFontSize(12) }}>
                                AI is extracting provider details...
                              </Text>
                            </View>
                          )}
                        </View>

                        {filteredIntegrative.length === 0 ? (
                          <View style={styles.emptyDepartmentContainer}>
                            <Text style={[
                              styles.emptyText,
                              {
                                color: colors.text,
                                fontSize: getScaledFontSize(14),
                                fontWeight: getScaledFontWeight(500) as any,
                              }
                            ]}>
                              {integrativeSearchQuery ? 'No matching providers found' : 'No records uploaded yet. Upload a health record to extract provider info.'}
                            </Text>
                          </View>
                        ) : (
                          filteredIntegrative.map((provider) => {
                            const isSelected = selectedProviderIds.has(String(provider.id));
                            const canAdd = !isSelected && !isCircleFull;
                            const showAction = isSelected || !isCircleFull;

                            return (
                              <DoctorCard
                                key={provider.id}
                                id={provider.id}
                                name={provider.providerName}
                                qualifications={provider.specialty || 'Integrative Health'}
                                image={null}
                                onPress={() => {
                                  router.back();
                                  setTimeout(() => {
                                    router.push(`/Home/non-ehr-provider-detail?id=${encodeURIComponent(provider.id)}`);
                                  }, 300);
                                }}
                                highlighted={isSelected}
                                actionIconName={showAction ? (isSelected ? 'minus' : 'plus') : undefined}
                                actionDisabled={!canAdd && !isSelected}
                                onActionPress={() => {
                                  if (isSelected) {
                                    removeProvider(provider.id);
                                  } else if (canAdd) {
                                    addProvider({
                                      id: provider.id,
                                      name: provider.providerName,
                                      qualifications: provider.specialty || 'Integrative Health',
                                      category: 'Integrative',
                                    });
                                  }
                                }}
                              />
                            );
                          })
                        )}
                      </ScrollView>
                    </TabScreen>
                  );
                }

                return (
                  <TabScreen
                    key={category.id}
                    label={category.name}
                  >
                    {showEmptyNonMedical ? (
                      <ScrollView contentContainerStyle={styles.cardsContainer}>
                        <View style={styles.addMemberContainer}>
                          {openManualFormKey === emptyFormKey ? (
                            <View style={styles.addMemberForm}>
                              <Menu
                                visible={isSubCategoryMenuVisible}
                                onDismiss={() => setIsSubCategoryMenuVisible(false)}
                                anchor={
                                  <Button
                                    mode="outlined"
                                    onPress={() => setIsSubCategoryMenuVisible(true)}
                                  >
                                    {manualSubCategoryLabel || 'Select sub-category'}
                                  </Button>
                                }
                              >
                                {subCategories.map(sub => (
                                  <Menu.Item
                                    key={sub.id}
                                    title={sub.name}
                                    onPress={() => {
                                      setManualSubCategoryId(sub.id);
                                      setIsSubCategoryMenuVisible(false);
                                    }}
                                  />
                                ))}
                              </Menu>
                              <PaperTextInput
                                label="Full name"
                                value={manualName}
                                onChangeText={setManualName}
                                mode="outlined"
                                style={styles.addMemberInput}
                              />
                              <PaperTextInput
                                label="Relationship"
                                value={manualRelationship}
                                onChangeText={setManualRelationship}
                                mode="outlined"
                                style={styles.addMemberInput}
                              />
                              <PaperTextInput
                                label="Phone"
                                value={manualPhone}
                                onChangeText={setManualPhone}
                                mode="outlined"
                                keyboardType="phone-pad"
                                style={styles.addMemberInput}
                              />
                              <PaperTextInput
                                label="Email"
                                value={manualEmail}
                                onChangeText={setManualEmail}
                                mode="outlined"
                                keyboardType="email-address"
                                autoCapitalize="none"
                                style={styles.addMemberInput}
                              />
                              <View style={styles.addMemberActions}>
                                <Button
                                  mode="outlined"
                                  onPress={() => {
                                    setOpenManualFormKey(null);
                                    setManualSubCategoryId(null);
                                  }}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  mode="contained"
                                  onPress={() => handleAddManualMember(category.id, manualSubCategoryId || '')}
                                  disabled={!manualName.trim() || !manualSubCategoryId}
                                >
                                  Add
                                </Button>
                              </View>
                            </View>
                          ) : (
                            <Button
                              mode="outlined"
                              onPress={() => {
                                setManualSubCategoryId(null);
                                setOpenManualFormKey(emptyFormKey);
                              }}
                            >
                              Add member
                            </Button>
                          )}
                        </View>
                      </ScrollView>
                    ) : category.subCategories && category.subCategories.length > 0 ? (
                      // Category has subcategories: Show nested tabs
                      <TabsProvider defaultIndex={0}>
                        <Tabs
                          showLeadingSpace={false}
                          showTextLabel={true}
                          uppercase={true}
                          mode="scrollable"
                          tabLabelStyle={{
                            fontSize: getScaledFontSize(12),
                            fontWeight: getScaledFontWeight(500) as any,
                            color: colors.text,
                            paddingHorizontal: Math.max(8, getScaledFontSize(12) / 2),
                            textAlign: 'center',
                            lineHeight: getScaledFontSize(18),
                          }}
                          tabHeaderStyle={{
                            backgroundColor: colors.background,
                            borderBottomColor: colors.text + '20',
                            borderBottomWidth: 1,
                          }}
                          style={{ backgroundColor: colors.background }}
                          dark={settings.isDarkTheme}
                        >
                          {subCategoriesToShow.map((subCategory) => {
                            const subCategoryKey = getSubCategoryKey(category.id, subCategory.id);
                            const manualMembers = manualMembersBySubCategory[subCategoryKey] || [];
                            const availableSubCategories = subCategories || [];
                            const manualProviders: SelectedProvider[] = manualMembers.map(member => ({
                              id: member.id,
                              name: member.name,
                              qualifications: member.relationship || 'Member',
                              image: undefined,
                              category: category.name,
                              subCategory: subCategory.name,
                              isManual: true,
                              relationship: member.relationship,
                            }));
                            let combinedProviders = filterProvidersByLastVisited([
                              ...subCategory.doctors,
                              ...manualProviders,
                            ]);
                            // Filter providers based on search query
                            if (providerSearchQuery.trim()) {
                              const query = providerSearchQuery.toLowerCase().trim();
                              combinedProviders = combinedProviders.filter(provider =>
                                provider.name.toLowerCase().includes(query) ||
                                (provider.qualifications && provider.qualifications.toLowerCase().includes(query)) ||
                                (provider.specialty && provider.specialty.toLowerCase().includes(query)) ||
                                (provider.relationship && provider.relationship.toLowerCase().includes(query))
                              );
                            }
                            const canAddMember = category.id !== 'medical';
                            const isFormOpen = openManualFormKey === subCategoryKey;
                            const manualSubCategoryLabel = manualSubCategoryId
                              ? availableSubCategories.find(sub => sub.id === manualSubCategoryId)?.name
                              : undefined;

                            return (
                              <TabScreen
                                key={subCategory.id}
                                label={subCategory.name}
                              >
                                <ScrollView contentContainerStyle={styles.cardsContainer}>
                                  <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                                    <PaperTextInput
                                      label="Search providers"
                                      value={providerSearchQuery}
                                      onChangeText={setProviderSearchQuery}
                                      mode="outlined"
                                      left={<PaperTextInput.Icon icon={() => <MaterialIcons name="search" size={getScaledFontSize(20)} color={colors.text + '80'} />} />}
                                      style={{ backgroundColor: colors.background }}
                                      textColor={colors.text}
                                      activeOutlineColor={colors.tint}
                                    />
                                  </View>
                                  {canAddMember && (
                                    <View style={styles.addMemberContainer}>
                                      {isFormOpen ? (
                                        <View style={styles.addMemberForm}>
                                          <Menu
                                            visible={isSubCategoryMenuVisible}
                                            onDismiss={() => setIsSubCategoryMenuVisible(false)}
                                            anchor={
                                              <Button
                                                mode="outlined"
                                                onPress={() => setIsSubCategoryMenuVisible(true)}
                                              >
                                                {manualSubCategoryLabel || subCategory.name || 'Select sub-category'}
                                              </Button>
                                            }
                                          >
                                            {availableSubCategories.map(sub => (
                                              <Menu.Item
                                                key={sub.id}
                                                title={sub.name}
                                                onPress={() => {
                                                  setManualSubCategoryId(sub.id);
                                                  setIsSubCategoryMenuVisible(false);
                                                }}
                                              />
                                            ))}
                                          </Menu>
                                          <PaperTextInput
                                            label="Full name"
                                            value={manualName}
                                            onChangeText={setManualName}
                                            mode="outlined"
                                            style={styles.addMemberInput}
                                          />
                                          <PaperTextInput
                                            label="Relationship"
                                            value={manualRelationship}
                                            onChangeText={setManualRelationship}
                                            mode="outlined"
                                            style={styles.addMemberInput}
                                          />
                                          <PaperTextInput
                                            label="Phone"
                                            value={manualPhone}
                                            onChangeText={setManualPhone}
                                            mode="outlined"
                                            keyboardType="phone-pad"
                                            style={styles.addMemberInput}
                                          />
                                          <PaperTextInput
                                            label="Email"
                                            value={manualEmail}
                                            onChangeText={setManualEmail}
                                            mode="outlined"
                                            keyboardType="email-address"
                                            autoCapitalize="none"
                                            style={styles.addMemberInput}
                                          />
                                          <View style={styles.addMemberActions}>
                                            <Button
                                              mode="outlined"
                                              onPress={() => {
                                                setOpenManualFormKey(null);
                                                setManualSubCategoryId(null);
                                              }}
                                            >
                                              Cancel
                                            </Button>
                                            <Button
                                              mode="contained"
                                              onPress={() => handleAddManualMember(category.id, subCategory.id)}
                                              disabled={!manualName.trim() || !(manualSubCategoryId || subCategory.id)}
                                            >
                                              Add
                                            </Button>
                                          </View>
                                        </View>
                                      ) : (
                                        <Button
                                          mode="outlined"
                                          onPress={() => {
                                            setManualSubCategoryId(subCategory.id);
                                            setOpenManualFormKey(subCategoryKey);
                                          }}
                                        >
                                          Add member
                                        </Button>
                                      )}
                                    </View>
                                  )}
                                  {combinedProviders.length === 0 ? (
                                    <View style={styles.emptyDepartmentContainer}>
                                      <Text style={[
                                        styles.emptyText,
                                        {
                                          color: colors.text,
                                          fontSize: getScaledFontSize(14),
                                          fontWeight: getScaledFontWeight(500) as any,
                                        }
                                      ]}>
                                        No providers in this sub-category
                                      </Text>
                                    </View>
                                  ) : (
                                    combinedProviders.map((provider) => {
                                      const isSelected = selectedProviderIds.has(String(provider.id));
                                      const canAdd = !isSelected && !isCircleFull;
                                      const showAction = isSelected || !isCircleFull;
                                      return (
                                        <DoctorCard
                                          key={provider.id}
                                          id={provider.id}
                                          name={provider.name}
                                          qualifications={provider.isManual
                                            ? (provider.relationship || provider.qualifications || 'Member')
                                            : (provider.qualifications || 'Healthcare Provider')}
                                          image={doctorPhotos.get(provider.id) ? { uri: doctorPhotos.get(provider.id)! } : (provider.image || null)}
                                          onPress={provider.isManual ? undefined : () => {
                                            router.back();
                                            setTimeout(() => {
                                              router.push(`/Home/doctor-detail?id=${encodeURIComponent(provider.id)}&name=${encodeURIComponent(provider.name)}&qualifications=${encodeURIComponent(provider.qualifications || '')}&specialty=${encodeURIComponent(provider.specialty || '')}`);
                                            }, 300);
                                          }}
                                          highlighted={isSelected}
                                          actionIconName={showAction ? (isSelected ? 'minus' : 'plus') : undefined}
                                          actionDisabled={!canAdd && !isSelected}
                                          onActionPress={() => {
                                            if (isSelected) {
                                              removeProvider(provider.id);
                                            } else if (canAdd) {
                                              addProvider(provider);
                                            }
                                          }}
                                        />
                                      );
                                    })
                                  )}
                                </ScrollView>
                              </TabScreen>
                            );
                          })}
                        </Tabs>
                      </TabsProvider>
                    ) : (
                      // Category has no subcategories: Show all providers directly
                      <ScrollView contentContainerStyle={styles.cardsContainer}>
                        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                          <PaperTextInput
                            label="Search providers"
                            value={providerSearchQuery}
                            onChangeText={setProviderSearchQuery}
                            mode="outlined"
                            left={<PaperTextInput.Icon icon={() => <MaterialIcons name="search" size={getScaledFontSize(20)} color={colors.text + '80'} />} />}
                            style={{ backgroundColor: colors.background }}
                            textColor={colors.text}
                            activeOutlineColor={colors.tint}
                          />
                        </View>
                        {(() => {
                          let filteredDoctors = filterProvidersByLastVisited(category.doctors);
                          // Filter providers based on search query
                          if (providerSearchQuery.trim()) {
                            const query = providerSearchQuery.toLowerCase().trim();
                            filteredDoctors = filteredDoctors.filter(provider =>
                              provider.name.toLowerCase().includes(query) ||
                              (provider.qualifications && provider.qualifications.toLowerCase().includes(query)) ||
                              (provider.specialty && provider.specialty.toLowerCase().includes(query))
                            );
                          }
                          return filteredDoctors.length === 0 ? (
                            <View style={styles.emptyDepartmentContainer}>
                              <Text style={[styles.emptyText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]}>
                                {category.doctors.length === 0 ? 'No providers in this category' : 'No providers match your search'}
                              </Text>
                            </View>
                          ) : (
                            filteredDoctors.map((provider) => {
                              const isSelected = selectedProviderIds.has(String(provider.id));
                              const canAdd = !isSelected && !isCircleFull;
                              const showAction = isSelected || !isCircleFull;
                              return (
                                <DoctorCard
                                  key={provider.id}
                                  id={provider.id}
                                  name={provider.name}
                                  qualifications={provider.qualifications || 'Healthcare Provider'}
                                  image={doctorPhotos.get(provider.id) ? { uri: doctorPhotos.get(provider.id)! } : (provider.image || null)}
                                  onPress={() => {
                                    router.back();
                                    setTimeout(() => {
                                      router.push(`/Home/doctor-detail?id=${encodeURIComponent(provider.id)}&name=${encodeURIComponent(provider.name)}&qualifications=${encodeURIComponent(provider.qualifications || '')}&specialty=${encodeURIComponent(provider.specialty || '')}`);
                                    }, 300);
                                  }}
                                  highlighted={isSelected}
                                  actionIconName={showAction ? (isSelected ? 'minus' : 'plus') : undefined}
                                  actionDisabled={!canAdd && !isSelected}
                                  onActionPress={() => {
                                    if (isSelected) {
                                      removeProvider(provider.id);
                                    } else if (canAdd) {
                                      addProvider(provider);
                                    }
                                  }}
                                />
                              );
                            })
                          );
                        })()}
                      </ScrollView>
                    )}
                  </TabScreen>
                );
              })}
            </Tabs>
          </TabsProvider>
        )}
      </Portal.Host>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerActionsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: 24,
  },
  headerActionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: 24,
    justifyContent: 'flex-end',
  },
  headerAction: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  tabs: {
    height: '100%',
  },
  tabHeader: {
    backgroundColor: 'white',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    minHeight: 48,
  },
  cardsContainer: {
    padding: 16,
    gap: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    marginTop: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    textAlign: 'center',
  },
  emptyDepartmentContainer: {
    padding: 20,
    alignItems: 'center',
  },
  addMemberContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  addMemberForm: {
    gap: 10,
  },
  addMemberInput: {
    backgroundColor: 'transparent',
  },
  addMemberActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  subCategorySection: {
    marginBottom: 24,
  },
  subCategoryTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  listAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  listItemContent: {
    flex: 1,
    marginLeft: 16,
  },
  listItemName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  listItemRole: {
    fontSize: 14,
    color: '#666',
  },
});
