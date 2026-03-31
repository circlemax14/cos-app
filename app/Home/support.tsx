import React, { useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AccessibleInput } from '@/components/ui/accessible-input';
import { AccessibleButton } from '@/components/ui/accessible-button';
import { SupportTicketCard } from '@/components/ui/support-ticket-card';
import { EmptyState } from '@/components/ui/empty-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAccessibility } from '@/stores/accessibility-store';
import { getColors, Spacing, Typography, Radii, SupportCategories } from '@/constants/design-system';
import { useSupportTickets, useCreateSupportTicket } from '@/hooks/use-support-tickets';

const EMERGENCY_PHONE = '1-800-273-8255';

export default function SupportScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = getColors(settings.isDarkTheme);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [subjectError, setSubjectError] = useState('');
  const [descriptionError, setDescriptionError] = useState('');
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  const { data: tickets, isLoading: isLoadingTickets } = useSupportTickets();
  const createTicket = useCreateSupportTicket();

  const selectedLabel = SupportCategories.find((c) => c.value === selectedCategory)?.label ?? '';

  const openCategoryPicker = () => {
    if (Platform.OS === 'ios') {
      const options = [...SupportCategories.map((c) => c.label), 'Cancel'];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
          title: 'Select a Category',
        },
        (buttonIndex) => {
          if (buttonIndex < SupportCategories.length) {
            setSelectedCategory(SupportCategories[buttonIndex].value);
            setSubjectError('');
          }
        },
      );
    } else {
      setShowCategoryModal(true);
    }
  };

  const validate = (): boolean => {
    let valid = true;
    if (!selectedCategory) {
      setSubjectError('Please select a category');
      valid = false;
    } else {
      setSubjectError('');
    }
    if (description.trim().length < 10) {
      setDescriptionError('Description must be at least 10 characters');
      valid = false;
    } else {
      setDescriptionError('');
    }
    return valid;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    createTicket.mutate(
      { subject: selectedLabel, description: description.trim() },
      {
        onSuccess: (result) => {
          Alert.alert(
            'Request Submitted!',
            `Your ticket ID is ${result.ticketId}. We'll get back to you within 24-48 hours.`,
          );
          setSelectedCategory(null);
          setDescription('');
        },
        onError: () => {
          Alert.alert('Error', 'Failed to submit your request. Please try again.');
        },
      },
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Form Section */}
        <Text
          style={[
            styles.sectionTitle,
            {
              color: colors.text,
              fontSize: getScaledFontSize(Typography.title1.fontSize),
              fontWeight: getScaledFontWeight(700) as never,
            },
          ]}
          accessibilityRole="header"
        >
          How can we help?
        </Text>

        {/* Category Picker */}
        <View style={styles.fieldContainer}>
          <Text
            style={[
              styles.fieldLabel,
              {
                color: subjectError ? colors.error : colors.text,
                fontSize: getScaledFontSize(Typography.footnote.fontSize),
                fontWeight: getScaledFontWeight(600) as never,
              },
            ]}
          >
            Category
          </Text>
          <Pressable
            onPress={openCategoryPicker}
            accessibilityRole="button"
            accessibilityLabel={`Category: ${selectedLabel || 'Select a category'}`}
            accessibilityHint="Double tap to choose a support category"
            style={[
              styles.pickerButton,
              {
                borderColor: subjectError ? colors.error : colors.border,
                backgroundColor: subjectError ? colors.errorBg : colors.background,
              },
            ]}
          >
            <Text
              style={[
                styles.pickerText,
                {
                  color: selectedCategory ? colors.text : colors.disabled,
                  fontSize: getScaledFontSize(Typography.body.fontSize),
                },
              ]}
            >
              {selectedLabel || 'Select a category'}
            </Text>
            <IconSymbol name="chevron.right" size={getScaledFontSize(16)} color={colors.secondary} />
          </Pressable>
          {subjectError ? (
            <View style={styles.errorRow} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <Text style={styles.errorIcon}>&#x26A0;&#xFE0F;</Text>
              <Text
                style={{
                  color: colors.error,
                  fontSize: getScaledFontSize(Typography.footnote.fontSize),
                  fontWeight: getScaledFontWeight(500) as never,
                }}
              >
                {subjectError}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Description Input */}
        <View style={styles.fieldContainer}>
          <AccessibleInput
            label="Description"
            placeholder="Describe your issue in detail..."
            value={description}
            onChangeText={(text) => {
              setDescription(text);
              if (text.trim().length >= 10) setDescriptionError('');
            }}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            error={descriptionError}
          />
        </View>

        {/* Submit Button */}
        <View style={styles.submitContainer}>
          <AccessibleButton
            variant="primary"
            label="Submit Request"
            onPress={handleSubmit}
            loading={createTicket.isPending}
            disabled={createTicket.isPending}
            accessibilityHint="Submits your support request"
          />
        </View>

        {/* Your Requests Section */}
        <View style={styles.ticketsSection}>
          <Text
            style={[
              styles.sectionTitle,
              {
                color: colors.text,
                fontSize: getScaledFontSize(Typography.title2.fontSize),
                fontWeight: getScaledFontWeight(600) as never,
              },
            ]}
            accessibilityRole="header"
          >
            Your Requests
          </Text>

          {isLoadingTickets ? (
            <Text style={{ color: colors.secondary, fontSize: getScaledFontSize(Typography.callout.fontSize) }}>
              Loading your tickets...
            </Text>
          ) : tickets && tickets.length > 0 ? (
            <View style={styles.ticketList}>
              {tickets.map((ticket) => (
                <View key={ticket.ticketId} style={styles.ticketItem}>
                  <SupportTicketCard ticket={ticket} />
                </View>
              ))}
            </View>
          ) : (
            <EmptyState
              icon="📩"
              title="No Requests Yet"
              description="When you submit a support request, it will appear here."
            />
          )}
        </View>

        {/* Emergency Contact */}
        <View style={[styles.emergencySection, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <Text
            style={[
              styles.emergencyTitle,
              {
                color: colors.text,
                fontSize: getScaledFontSize(Typography.headline.fontSize),
                fontWeight: getScaledFontWeight(600) as never,
              },
            ]}
          >
            Need immediate help?
          </Text>
          <Text
            style={{
              color: colors.secondary,
              fontSize: getScaledFontSize(Typography.callout.fontSize),
              marginBottom: Spacing.md,
            }}
          >
            If you are experiencing a medical emergency, call 911. For crisis support:
          </Text>
          <AccessibleButton
            variant="secondary"
            label={`Call ${EMERGENCY_PHONE}`}
            onPress={() => Linking.openURL(`tel:${EMERGENCY_PHONE}`)}
            accessibilityHint="Opens your phone dialer to call the support hotline"
          />
        </View>
      </ScrollView>

      {/* Android/non-iOS Category Modal */}
      {Platform.OS !== 'ios' && (
        <Modal
          visible={showCategoryModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowCategoryModal(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setShowCategoryModal(false)}>
            <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
              <Text
                style={[
                  styles.modalTitle,
                  {
                    color: colors.text,
                    fontSize: getScaledFontSize(Typography.title2.fontSize),
                    fontWeight: getScaledFontWeight(600) as never,
                  },
                ]}
              >
                Select a Category
              </Text>
              <ScrollView>
                {SupportCategories.map((cat) => (
                  <Pressable
                    key={cat.value}
                    style={[
                      styles.modalOption,
                      {
                        backgroundColor: selectedCategory === cat.value ? colors.primaryLight : 'transparent',
                      },
                    ]}
                    onPress={() => {
                      setSelectedCategory(cat.value);
                      setSubjectError('');
                      setShowCategoryModal(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={cat.label}
                  >
                    <Text
                      style={{
                        color: selectedCategory === cat.value ? colors.primary : colors.text,
                        fontSize: getScaledFontSize(Typography.body.fontSize),
                        fontWeight: getScaledFontWeight(selectedCategory === cat.value ? 600 : 400) as never,
                      }}
                    >
                      {cat.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={styles.modalCancel}>
                <AccessibleButton
                  variant="secondary"
                  label="Cancel"
                  onPress={() => setShowCategoryModal(false)}
                />
              </View>
            </View>
          </Pressable>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.screenPadding,
    paddingBottom: 40,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
  },
  fieldContainer: {
    marginBottom: Spacing.md,
  },
  fieldLabel: {
    marginLeft: 2,
    marginBottom: Spacing.xs + 2,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    minHeight: 50,
  },
  pickerText: {},
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs + 2,
    marginLeft: 2,
    marginTop: Spacing.xs + 2,
  },
  errorIcon: {
    fontSize: 16,
  },
  submitContainer: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  ticketsSection: {
    marginBottom: Spacing.xl,
  },
  ticketList: {
    gap: Spacing.sm,
  },
  ticketItem: {
    marginBottom: Spacing.sm,
  },
  emergencySection: {
    borderRadius: Radii.xl,
    borderWidth: 1.5,
    padding: Spacing.cardPadding,
    marginBottom: Spacing.lg,
  },
  emergencyTitle: {
    marginBottom: Spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    padding: Spacing.cardPadding,
    maxHeight: '60%',
  },
  modalTitle: {
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  modalOption: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.sm,
    marginBottom: Spacing.xs,
  },
  modalCancel: {
    marginTop: Spacing.md,
  },
});
