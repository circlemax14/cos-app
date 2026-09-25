import { DoctorCard } from '@/components/ui/doctor-card';
import { providerContextLine } from '@/lib/provider-context-line';
import { providerInactiveReason, inactiveLabel } from '@/utils/provider-direct-care';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { router } from 'expo-router';
import { dismissTo } from '@/lib/dismiss-to';
import { FindPeopleEntry } from '@/components/social/FindPeopleEntry';
import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View , ActivityIndicator as RNActivityIndicator, Alert } from 'react-native';
import { Button, Menu, Portal, Text, TextInput as PaperTextInput } from 'react-native-paper';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Tabs, TabScreen, TabsProvider } from 'react-native-paper-tabs';
import { fetchProviders } from '@/services/api/providers';
import type { Provider } from '@/services/api/types';
import { SUPPORT_CATEGORIES, matchProviderToSubCategory } from '@/constants/categories';
import { getAllCareManagerAgencies, searchCareManagerAgencies, type CareManagerAgency } from '@/services/care-manager-agencies';
import { FilterMenu } from '@/components/ui/filter-menu';
import { MAX_SELECTED_PROVIDERS, useProviderSelection, type SelectedProvider } from '@/stores/provider-selection-store';
import { useDoctorPhotos } from '@/hooks/use-doctor-photo';
import * as DocumentPicker from 'expo-document-picker';
// COS-930 — SafeAreaView root, because the app is EDGE-TO-EDGE on Android.
//
// android/gradle.properties sets edgeToEdgeEnabled=true and styles.xml makes
// the status bar transparent, so a plain flex:1 View starts at y=0 — under the
// clock and the punch-hole camera. Worse than ugly: the SystemUI status-bar
// window is touchable and sits ON TOP of the app, so a close button or a menu
// trigger inside that strip receives no taps at all. Vishal hit this on an S26.
//
// No iOS regression: these are `presentation: 'modal'` routes, where
// safe-area-context reports a top inset of 0 inside the sheet, so the
// SafeAreaView adds nothing. On the full-screen ones it is a fix for iOS too.
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getNonEhrProviders,
  processAndStoreFiles,
  clearAllNonEhrData,
  type NonEhrProvider,
} from '@/services/non-ehr-processor';

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';


/*
 * COS-1122 — the chosen filter survives closing the modal, for this app run.
 *
 * `recencyFilter` was component state, and the Supports modal unmounts when it
 * closes. So picking "Stable & resolved", closing, and reopening silently
 * dropped the choice and reset the list to everyone — Vishal saw the active dot
 * vanish, which was the indicator telling the truth about state he had lost.
 *
 * Deliberately module scope and NOT persisted storage. A choice made a minute
 * ago should still be there when you come back; a choice made last week should
 * not silently hide providers on a cold start, which is the exact failure
 * COS-1121 fixed. Remembering it for the app session honours both: the filter
 * survives a close, and a fresh launch always opens on everyone.
 */
let sessionRecencyFilter: string | null = 'all';

interface CategoryGroup {
  id: string;
  /** The STORED value — see constants/categories.ts. Not the label. */
  name: string;
  /** COS-996 — display label; falls back to `name`. */
  displayName?: string;
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
  /*
   * COS-1090 — Ken: "by default we will use the six months to one year one
   * filter", and "if they want to go into these other categories, they can
   * press a tab or search them or drop down".
   *
   * Defaulting to a VALUE rather than null is the whole point: on his real
   * account the unfiltered list is 83 providers and the default band is 8.
   */
  /*
   * COS-1121 — opens on EVERYONE, not on 'current-acute'.
   *
   * The filter used to be pre-applied before the patient had touched the
   * control, and it silently removed anyone last seen more than a year ago.
   * On the pilot patient's record that is almost all of them: his newest
   * provider contact is from February 2025, so a default of 'current-acute'
   * emptied every Medical sub-category and he reported "I can see provider
   * bubbles but no providers under Medical".
   *
   * A filter the user did not set must not hide their data. Opening on
   * everyone and letting them narrow is the honest order — and it is the only
   * default under which "the list is empty" means something true.
   */
  const [recencyFilter, setRecencyFilterState] = React.useState<string | null>(
    sessionRecencyFilter,
  );
  // Every write goes through here so the module-scope memory and the render
  // state can never disagree.
  const setRecencyFilter = React.useCallback((next: string | null) => {
    sessionRecencyFilter = next;
    setRecencyFilterState(next);
  }, []);
  // COS-1103 — which category tab is open, so the header can show the filter
  // only where it applies. Index rather than id: that is what TabsProvider
  // reports, and deriving the id from categoryGroups keeps one source of truth.
  const [activeCategoryIndex, setActiveCategoryIndex] = React.useState(0);
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

  /*
   * COS-968 — a filter that emptied the list.
   *
   * These options used to be "Last 3 months / 6 months / 1 year / 2 years /
   * 5 years", filtered on `provider.lastVisited`. NOTHING in cos-backend or
   * cos-app has ever written that field — zero hits across every repo — so
   * `if (!provider.lastVisited) return false` deleted every EHR provider the
   * moment any option was picked. Choosing a filter emptied the screen.
   *
   * `hasData` and `recordCount` are computed by the backend and already on
   * the row, so this asks a question the data can actually answer, and it is
   * the question Ken's "filter it in a meaningful way" is really about: show
   * me the doctors I have records from.
   */
  /*
   * COS-1090 — Ken's three recency bands, renamed by Hitesh on 2026-09-23
   * ("stable is a more user-friendly term than chronic").
   *
   * "Everyone" is here because the bands deliberately EXCLUDE providers with
   * no dated record at all — 61 of Ken's 83 — and a filter that can hide
   * three quarters of a list with no way to see them is a trap.
   */
  const RECENCY_FILTERS = [
    { id: 'current-acute', label: 'Current & acute' },
    { id: 'recent-stable', label: 'Recent & stable' },
    { id: 'stable-resolved', label: 'Stable & resolved' },
    { id: 'all', label: 'Everyone' },
  ];

  /*
   * COS-1101 — can this list be filtered by recency at all?
   *
   * Exported from the filter so the UI can SAY SO. Vishal: "if I click on any
   * filter like stable and resolved, that row is highlighted but I don't see
   * anywhere the filters are applied."
   *
   * He was looking at the fail-open working exactly as designed and it looked
   * broken — which means the design was half right. Ignoring a filter the user
   * just chose is the correct behaviour when no provider has a date; doing it
   * SILENTLY is not.
   */
  const anyRecencyData = (providers: SelectedProvider[]) =>
    providers.some(p => p.recencyBand != null);

  /*
   * COS-1121 — a category's providers live in its SUB-CATEGORIES.
   *
   * `category.doctors` is hard-coded `[]` at construction, so
   * `anyRecencyData(category.doctors)` was `[].some(...)` — always false. The
   * banner below it therefore rendered on EVERY filtered view, telling the
   * patient "Showing everyone — we do not have visit dates" at the exact
   * moment the filter was hiding people. It did not merely fail to explain the
   * control, it asserted the opposite of what was happening.
   */
  const providersInCategory = (category: CategoryGroup): SelectedProvider[] =>
    (category.subCategories ?? []).flatMap(sub => sub.doctors as SelectedProvider[]);

  const filterProvidersByRecency = (providers: SelectedProvider[]) => {
    if (!recencyFilter || recencyFilter === 'all') return providers;

    /*
     * COS-1093 — if NOTHING can be banded, the filter cannot mean anything, so
     * it must not be applied.
     *
     * The band comes from the newest dated clinical record linking a provider
     * to the patient. A patient whose records carry no usable dates — an EHR
     * that never sent them, an import still in flight, or a seeded test
     * account — gets `null` on every provider. Filtering on that hid all 59
     * providers on the dev account and showed an empty Medical tab.
     *
     * That is the "you have nothing" failure again: the screen would claim the
     * patient has no providers when the truth is that we could not date the
     * ones they have. Same rule the server already follows for involvement —
     * a patient seeing too many doctors is a far better failure than a patient
     * seeing none.
     *
     * Note this is deliberately NOT "the selected band is empty". A patient
     * whose providers are all three years old SHOULD open on an empty
     * "Current & acute" and switch tabs — that is the honest answer to the
     * question they asked. The bypass is only for "no answer exists at all".
     */
    if (!anyRecencyData(providers)) return providers;

    return providers.filter(provider => {
      // Manually added people and non-medical supports have no EHR dates by
      // definition. A recency filter must never hide the care circle.
      if (provider.isManual) return true;
      if (provider.category && provider.category.toLowerCase() !== 'medical') return true;
      return provider.recencyBand === recencyFilter;
    });
  };

  /*
   * COS-1101 — ONE filter, not two.
   *
   * Vishal: "there was already one filter present, but now you added one more.
   * I don't know why we have two. We should get only one."
   *
   * The records filter (with-records / no-records) is gone. It asked a
   * question the recency filter answers better: "have I seen this person, and
   * when" is strictly more informative than "is there any record at all", and
   * two controls that overlap force the reader to work out how they combine.
   */
  const filterProvidersByLastVisited = (providers: SelectedProvider[]) =>
    filterProvidersByRecency(providers);

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

  /*
   * COS-1103 — the header's view of the filter.
   *
   * `showRecencyFilter` is gated on the OPEN TAB, not on the screen: a recency
   * band is computed from dated clinical records, so on Agencies and Social it
   * could filter nothing and offering it there was the original complaint.
   *
   * `integrative` is included because it is the other category that will carry
   * dated records once uploads are processed.
   */
  const activeCategoryId = categoryGroups[activeCategoryIndex]?.id;
  const showRecencyFilter =
    activeCategoryId === 'medical' || activeCategoryId === 'integrative';
  /*
   * "Everyone" is the off position, not an applied filter — the dot must not
   * claim a filter is narrowing a list it is showing in full.
   */
  const isRecencyFilterActive = recencyFilter !== null && recencyFilter !== 'all';
  const activeRecencyLabel =
    RECENCY_FILTERS.find((f) => f.id === recencyFilter)?.label ?? 'Everyone';

  const closeModal = () => {
    dismissTo('/Home');
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
          /*
           * COS-983 — this comparison never matched, so the backend's answer
           * was thrown away.
           *
           * `cat.name` is 'Medical'; `provider.category` is LOWERCASED at
           * services/api/providers.ts:81. So categoryMatch was always
           * undefined, the mapping below never ran, and every provider fell
           * through to keyword guessing — which is the thing that files
           * PADMA DASARI MD under Physician Assistants.
           *
           * Identical to the defect COS-971 fixed five lines away at :147.
           * The lowercasing is deliberate upstream; the comparison has to
           * meet it rather than the other way round.
           */
          const categoryMatch = provider.category
            ? SUPPORT_CATEGORIES.find(
                cat => cat.name.toLowerCase() === provider.category?.toLowerCase(),
              )
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
            displayName: categoryDef.displayName,
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
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={[styles.container, { backgroundColor: colors.background }]}>
      <Portal.Host>
        <View style={styles.modalHeader}>
          {/*
            COS-1103 — the filter is back in the header, where it was, but it
            only appears on the tabs where a band means anything.

            COS-1101 moved it into the Medical body because it was showing on
            Agencies and Social, where it can filter nothing. That fixed the
            wrong half: the problem was never the position, it was that the
            control appeared regardless of context. So it returns to the bar
            beside the close button and is gated on the open tab instead.
          */}
          <View style={styles.headerActionsLeft}>
            {showRecencyFilter && (
              <FilterMenu
                options={RECENCY_FILTERS}
                selectedId={recencyFilter}
                onSelect={setRecencyFilter}
                onClear={() => setRecencyFilter('all')}
                color={colors.text}
                menuBackgroundColor={colors.background}
                menuTextColor={colors.text}
                menuHighlightColor={colors.tint + '20'}
                fontSize={getScaledFontSize(14)}
                fontWeight={getScaledFontWeight(500) as any}
                iconSize={getScaledFontSize(22)}
                // The dot, and the colour change, so an applied filter is
                // visible without opening the menu that applied it.
                active={isRecencyFilterActive}
                activeColor={colors.tint}
                accessibilityLabel={
                  isRecencyFilterActive
                    ? `Filter providers by recency. Currently ${activeRecencyLabel}`
                    : 'Filter providers by how recently they treated you'
                }
              />
            )}
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
              /*
               * COS-1103 — the header needs to know which category is open.
               *
               * Vishal: the filter icon belongs back in the SUPPORTS bar next
               * to the close button, but only while the Medical tab is
               * showing. The header sits above the tabs, so the only way it
               * can know is for the tabs to tell it.
               */
              setActiveCategoryIndex(index);
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
                /*
                 * COS-1007 — REVERTED. Medical shows its full taxonomy again.
                 *
                 * I hid the empty Medical subcategories to shorten a scrollable
                 * tab strip whose edge tabs are easy to mis-tap. That treated a
                 * symptom and destroyed information: with the real defect still
                 * putting every provider in "Others", hiding the empties left
                 * Vishal looking at a Medical tab with ONE subcategory. Worse
                 * than what he reported.
                 */
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
                      label={category.displayName ?? category.name}
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
                            <View
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
                              <TouchableOpacity
                                style={[styles.listItemContent, { marginLeft: getScaledFontSize(16), flex: 1 }]}
                                onPress={() => {
                                  /*
                                   * COS-999 — dismiss the sheet, THEN push.
                                   *
                                   * This was the one detail target in this file
                                   * that pushed without closing the sheet first
                                   * (the doctor rows at :694 and :1022 already
                                   * did). Pushing from inside a presented sheet
                                   * renders the next screen INSIDE it — which is
                                   * why agency-detail needed a modal
                                   * presentation, and why it never had a tab bar.
                                   */
                                  dismissTo('/Home');
                                  setTimeout(() => {
                                    router.push(`/Home/agency-detail?id=${encodeURIComponent(agency.id)}&name=${encodeURIComponent(agency.name)}&from=supports` as never);
                                  }, 300);
                                }}
                                activeOpacity={0.7}
                              >
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
                              </TouchableOpacity>
                              {/*
                                * COS-996 — the manual add/remove is gone.
                                *
                                * Vishal: "once any agency is approved, that agency
                                * will be directly added to the circle. We don't need
                                * to give user a manual option."
                                *
                                * It was also never tied to membership: this button
                                * wrote `selectedCareManager` directly, so a patient
                                * could put an agency in their circle without ever
                                * requesting to join it, and an approved patient
                                * stayed out until they found this button. The ring
                                * and the membership could disagree in both
                                * directions. Approval now writes the ring in the
                                * same transaction as the membership
                                * (agency-request.service.ts), and leaving clears it.
                                *
                                * A chevron, because the row still opens the agency.
                                */}
                              <View
                                style={{ padding: getScaledFontSize(8), minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                                pointerEvents="none"
                              >
                                <IconSymbol name="chevron.right" size={getScaledFontSize(18)} color={colors.text + '60'} />
                              </View>
                            </View>
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
                      label={category.displayName ?? category.name}
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
                                  dismissTo('/Home');
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
                    label={category.displayName ?? category.name}
                  >
                    {/*
                      COS-1113 — ONE direct child of TabScreen. More than one
                      crashes the native snapshot on iOS 26, which is why this
                      wrapper exists rather than two siblings.

                      FindPeopleEntry is hoisted ABOVE the ternary because it
                      used to sit only in the else branch, and that branch never
                      ran for Social. `showEmptyNonMedical` is true whenever a
                      non-medical category has no rows, and Social can never
                      have any: matchProviderToSubCategory hard-codes the
                      category to 'medical' (constants/categories.ts), the
                      server only ever sends category 'Medical', and manual
                      members are unhydrated useState that dies with the modal.
                      So the one entry point to Find People was unreachable from
                      the Social tab in its normal state — exactly the state in
                      which a patient most needs it.
                    */}
                    <View style={{ flex: 1 }}>
                    {category.id === 'social' && <FindPeopleEntry />}
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
                      /*
                       * COS-1063 — ONE direct child, always.
                       *
                       * react-native-paper-tabs <TabScreen> with more than one
                       * direct child crashes the native snapshot on iOS 26, so
                       * the Social tab's new "Find people" entry cannot be a
                       * sibling of the nested <TabsProvider>. This flex:1 View
                       * wraps them instead: same children, same order, one
                       * extra parent — the shape COS-1032 used for the same
                       * reason.
                       *
                       * The entry renders for `social` only. The other
                       * subcategory tabs (Medical, Psychological) are provider
                       * directories; connecting to a person is not what they
                       * are for.
                       */
                      <View style={{ flex: 1 }}>
                      {/*
                        COS-1101 — say WHY the filter did nothing.
                        Kept in the BODY even though the control moved back to
                        the header (COS-1103): this explains the LIST, and a
                        message about the list belongs beside it rather than
                        under an icon three rows above.

                        A provider is banded from the newest dated record
                        linking them to this patient. When no provider has one —
                        an import still running, an EHR that sent no dates, a
                        seeded test account — filtering would empty the list, so
                        it is skipped. Doing that silently is what made the
                        control look broken.
                      */}
                      {(category.id === 'medical' || category.id === 'integrative') &&
                        recencyFilter !== 'all' &&
                        !anyRecencyData(providersInCategory(category)) && (
                          <Text
                            style={{
                              color: colors.text + 'AA',
                              fontSize: getScaledFontSize(12),
                              paddingHorizontal: 16,
                              paddingBottom: 8,
                            }}
                          >
                            Showing everyone — we do not have visit dates for these providers yet.
                          </Text>
                        )}
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
                            /*
                             * COS-1121 — "empty" has two very different causes
                             * and the screen could not tell them apart.
                             *
                             * A sub-category with providers that the recency
                             * filter removed looked identical to one that has
                             * nobody in it. The patient is then told they have
                             * no providers, which is false, and given no way to
                             * discover that a control they never touched did it.
                             */
                            const hiddenByFilter =
                              subCategory.doctors.length + manualProviders.length -
                              combinedProviders.length;
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
                                  {combinedProviders.length === 0 && hiddenByFilter > 0 && (
                                    <TouchableOpacity
                                      onPress={() => setRecencyFilter('all')}
                                      accessibilityRole="button"
                                      accessibilityLabel={`${hiddenByFilter} hidden by the current filter. Tap to show everyone.`}
                                      style={{ paddingHorizontal: 16, paddingBottom: 12 }}
                                    >
                                      <Text
                                        style={{
                                          color: colors.text,
                                          fontSize: getScaledFontSize(13),
                                          lineHeight: getScaledFontSize(19),
                                        }}
                                      >
                                        {`${hiddenByFilter} ${hiddenByFilter === 1 ? 'person is' : 'people are'} hidden by the “${activeRecencyLabel}” filter. `}
                                        <Text style={{ color: colors.tint, fontWeight: '700' }}>
                                          Show everyone
                                        </Text>
                                      </Text>
                                    </TouchableOpacity>
                                  )}
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
                                      // SCRUM-265 #6: indirect-care + records-missing → inactive.
                                      // SCRUM-279 (2026-06-10 build 39): only mark inactive for
                                      // NOT-yet-selected providers — Ken couldn't remove circle
                                      // members whose specialty matched the indirect-care list.
                                      const inactiveReason = !provider.isManual && !isSelected
                                        ? providerInactiveReason(provider)
                                        : null;
                                      return (
                                        <DoctorCard
                                          key={provider.id}
                                          id={provider.id}
                                          name={provider.name}
                                          qualifications={provider.isManual
                                            ? (provider.relationship || provider.qualifications || 'Member')
                                            : (provider.qualifications || 'Healthcare Provider')}
                                          image={doctorPhotos.get(provider.id) ? { uri: doctorPhotos.get(provider.id)! } : (provider.image || null)}
                                          inactive={!!inactiveReason}
                                          inactiveReason={inactiveReason ? inactiveLabel(inactiveReason) : undefined}
                                          onPress={provider.isManual ? undefined : () => {
                                            dismissTo('/Home');
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
                      </View>
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
                          /*
                           * COS-1121 — read the providers the category ACTUALLY
                           * holds. `category.doctors` is hard-coded `[]` at
                           * construction (every provider lives in a
                           * sub-category), so this branch filtered an empty
                           * array and rendered "No providers in this category"
                           * unconditionally, whatever the patient had.
                           *
                           * It is the fallback branch for a category with no
                           * sub-categories, so it is rarely reached today —
                           * which is exactly why it could sit wrong. Same
                           * always-empty source as the banner above it.
                           */
                          const categoryProviders = providersInCategory(category);
                          let filteredDoctors = filterProvidersByLastVisited(categoryProviders);
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
                                {categoryProviders.length === 0 ? 'No providers in this category' : 'No providers match your search'}
                              </Text>
                            </View>
                          ) : (
                            filteredDoctors.map((provider) => {
                              const isSelected = selectedProviderIds.has(String(provider.id));
                              const canAdd = !isSelected && !isCircleFull;
                              const showAction = isSelected || !isCircleFull;
                              // SCRUM-279 (2026-06-10 build 39): only mark inactive for
                              // NOT-yet-selected providers — selected ones must remain
                              // removable from the circle (build 38 regression).
                              const inactiveReason = !isSelected ? providerInactiveReason(provider) : null;
                              return (
                                <DoctorCard
                                  key={provider.id}
                                  id={provider.id}
                                  name={provider.name}
                                  qualifications={provider.qualifications || 'Healthcare Provider'}
                                  /* COS-1114 — show the evidence the recency
                                     filter acted on. Without it a working
                                     filter reads as the app guessing. */
                                  contextLine={providerContextLine(provider)}
                                  image={doctorPhotos.get(provider.id) ? { uri: doctorPhotos.get(provider.id)! } : (provider.image || null)}
                                  inactive={!!inactiveReason}
                                  inactiveReason={inactiveReason ? inactiveLabel(inactiveReason) : undefined}
                                  onPress={() => {
                                    dismissTo('/Home');
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
                    </View>
                  </TabScreen>
                );
              })}
            </Tabs>
          </TabsProvider>
        )}
      </Portal.Host>
    </SafeAreaView>
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
