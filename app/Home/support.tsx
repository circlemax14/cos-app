import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppWrapper } from '@/components/app-wrapper';
import { SupportTicketCard } from '@/components/ui/support-ticket-card';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useSupportTickets, useCreateSupportTicket } from '@/hooks/use-support-tickets';

export default function SupportScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const [description, setDescription] = useState('');
  const [descriptionError, setDescriptionError] = useState('');

  const { data: tickets, isLoading: isLoadingTickets } = useSupportTickets();
  const createTicket = useCreateSupportTicket();

  const handleSubmit = () => {
    if (description.trim().length < 10) {
      setDescriptionError('Please describe your issue (at least 10 characters)');
      return;
    }
    setDescriptionError('');

    createTicket.mutate(
      { subject: 'Support Request', description: description.trim() },
      {
        onSuccess: (result) => {
          Alert.alert(
            'Request Submitted!',
            `Your ticket ID is ${result.ticketId}. We'll get back to you within 24-48 hours.`,
          );
          setDescription('');
        },
        onError: () => {
          Alert.alert('Error', 'Failed to submit your request. Please try again.');
        },
      },
    );
  };

  // Scale-aware sizes
  const scaledFontTitle = getScaledFontSize(22);
  const scaledFontBody = getScaledFontSize(14);
  const scaledFontInput = getScaledFontSize(16);
  const scaledFontLabel = getScaledFontSize(14);
  const scaledFontButton = getScaledFontSize(16);
  const scaledFontSection = getScaledFontSize(18);
  const scaledFontSmall = getScaledFontSize(13);
  const scaledFontMedium = getScaledFontSize(15);
  const scaledLineHeight = Math.round(scaledFontInput * 1.4);
  const scaledButtonHeight = Math.max(48, scaledFontButton + 28);
  const scaledTextAreaMinHeight = Math.max(140, scaledFontInput * 8);

  return (
    <AppWrapper>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Form Section */}
          <View style={styles.formSection}>
            <Text style={styles.emoji}>💬</Text>

            <Text
              style={{
                color: colors.text,
                fontSize: scaledFontTitle,
                fontWeight: getScaledFontWeight(700) as any,
                textAlign: 'center',
                marginBottom: 8,
              }}
              accessibilityRole="header"
            >
              Help & Support
            </Text>

            <Text
              style={{
                color: colors.subtext,
                fontSize: scaledFontBody,
                textAlign: 'center',
                lineHeight: Math.round(scaledFontBody * 1.5),
                marginBottom: 24,
                paddingHorizontal: 10,
              }}
            >
              Describe your issue below and our team will get back to you within 24-48 hours.
            </Text>

            {/* Description Input */}
            <View style={styles.inputContainer}>
              <Text
                style={{
                  color: descriptionError ? '#DC2626' : colors.text,
                  fontSize: scaledFontLabel,
                  fontWeight: getScaledFontWeight(600) as any,
                  marginBottom: 8,
                  marginLeft: 4,
                }}
              >
                Describe your issue
              </Text>
              <TextInput
                style={{
                  color: colors.text,
                  fontSize: scaledFontInput,
                  lineHeight: scaledLineHeight,
                  borderWidth: 1.5,
                  borderRadius: 12,
                  padding: 14,
                  minHeight: scaledTextAreaMinHeight,
                  borderColor: descriptionError ? '#DC2626' : colors.border,
                  backgroundColor: descriptionError
                    ? '#FEF2F2'
                    : settings.isDarkTheme
                      ? colors.card
                      : '#F9FAFB',
                }}
                placeholder="Tell us what's going on..."
                placeholderTextColor={colors.subtext}
                value={description}
                onChangeText={(text) => {
                  setDescription(text);
                  if (text.trim().length >= 10) setDescriptionError('');
                }}
                multiline
                textAlignVertical="top"
                accessibilityLabel="Describe your issue"
                accessibilityHint="Enter at least 10 characters"
              />
              {descriptionError ? (
                <Text
                  style={{
                    color: '#DC2626',
                    fontSize: scaledFontSmall,
                    marginTop: 6,
                    marginLeft: 4,
                  }}
                  accessibilityRole="alert"
                >
                  {descriptionError}
                </Text>
              ) : null}
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={createTicket.isPending}
              accessibilityRole="button"
              accessibilityLabel="Submit support request"
              style={{
                backgroundColor: createTicket.isPending ? colors.disabled : colors.tint,
                borderRadius: 24,
                width: '100%',
                minHeight: scaledButtonHeight,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 12,
                paddingHorizontal: 20,
              }}
            >
              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: scaledFontButton,
                  fontWeight: getScaledFontWeight(600) as any,
                }}
              >
                {createTicket.isPending ? 'Submitting...' : 'Submit Request'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Your Requests Section */}
          <View style={styles.ticketsSection}>
            <Text
              style={{
                color: colors.text,
                fontSize: scaledFontSection,
                fontWeight: getScaledFontWeight(600) as any,
                marginBottom: 14,
              }}
              accessibilityRole="header"
            >
              Your Requests
            </Text>

            {isLoadingTickets ? (
              <Text
                style={{
                  color: colors.subtext,
                  fontSize: scaledFontBody,
                  textAlign: 'center',
                  paddingVertical: 20,
                }}
              >
                Loading your tickets...
              </Text>
            ) : tickets && tickets.length > 0 ? (
              <View>
                {tickets.map((ticket) => (
                  <View key={ticket.ticketId} style={{ marginBottom: 10 }}>
                    <SupportTicketCard ticket={ticket} />
                  </View>
                ))}
              </View>
            ) : (
              <View style={[styles.emptyTickets, { backgroundColor: colors.card }]}>
                <Text style={styles.emptyEmoji}>📩</Text>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: scaledFontMedium,
                    fontWeight: getScaledFontWeight(600) as any,
                    marginBottom: 4,
                  }}
                >
                  No Requests Yet
                </Text>
                <Text
                  style={{
                    color: colors.subtext,
                    fontSize: scaledFontSmall,
                    textAlign: 'center',
                  }}
                >
                  When you submit a support request, it will appear here.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    flexGrow: 1,
  },
  formSection: {
    alignItems: 'center',
    marginBottom: 36,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  inputContainer: {
    width: '100%',
    marginBottom: 20,
  },
  ticketsSection: {
    marginTop: 8,
  },
  emptyTickets: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  emptyEmoji: {
    fontSize: 36,
    marginBottom: 10,
  },
});
