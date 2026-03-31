import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from 'react-native-paper';
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
              style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(22), fontWeight: getScaledFontWeight(700) as any }]}
              accessibilityRole="header"
            >
              Help & Support
            </Text>

            <Text style={[styles.subtitle, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
              Describe your issue below and our team will get back to you within 24-48 hours.
            </Text>

            {/* Description Input */}
            <View style={styles.inputContainer}>
              <Text
                style={[
                  styles.inputLabel,
                  { color: descriptionError ? '#DC2626' : colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any },
                ]}
              >
                Describe your issue
              </Text>
              <TextInput
                style={[
                  styles.textArea,
                  {
                    color: colors.text,
                    borderColor: descriptionError ? '#DC2626' : colors.border,
                    backgroundColor: descriptionError
                      ? '#FEF2F2'
                      : settings.isDarkTheme
                        ? colors.card
                        : '#F9FAFB',
                  },
                ]}
                placeholder="Tell us what's going on..."
                placeholderTextColor={colors.subtext}
                value={description}
                onChangeText={(text) => {
                  setDescription(text);
                  if (text.trim().length >= 10) setDescriptionError('');
                }}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                allowFontScaling
                accessibilityLabel="Describe your issue"
                accessibilityHint="Enter at least 10 characters"
              />
              {descriptionError ? (
                <Text style={[styles.errorText, { fontSize: getScaledFontSize(13) }]} accessibilityRole="alert">
                  {descriptionError}
                </Text>
              ) : null}
            </View>

            {/* Submit Button */}
            <Button
              mode="contained"
              onPress={handleSubmit}
              loading={createTicket.isPending}
              disabled={createTicket.isPending}
              style={[
                styles.submitButton,
                { backgroundColor: createTicket.isPending ? colors.disabled : colors.tint },
              ]}
              contentStyle={styles.submitContent}
              labelStyle={[styles.submitLabel, { fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}
              accessibilityLabel="Submit support request"
            >
              Submit Request
            </Button>
          </View>

          {/* Your Requests Section */}
          <View style={styles.ticketsSection}>
            <Text
              style={[styles.ticketsSectionTitle, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(600) as any }]}
              accessibilityRole="header"
            >
              Your Requests
            </Text>

            {isLoadingTickets ? (
              <Text style={[styles.loadingText, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
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
                <Text style={[styles.emptyTitle, { color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(600) as any }]}>
                  No Requests Yet
                </Text>
                <Text style={[styles.emptySubtitle, { color: colors.subtext, fontSize: getScaledFontSize(13) }]}>
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
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  inputContainer: {
    width: '100%',
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 4,
  },
  textArea: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    minHeight: 140,
    lineHeight: 22,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 13,
    marginTop: 6,
    marginLeft: 4,
  },
  submitButton: {
    borderRadius: 24,
    width: '100%',
  },
  submitContent: {
    height: 48,
  },
  submitLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  ticketsSection: {
    marginTop: 8,
  },
  ticketsSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 14,
  },
  loadingText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
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
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
  },
});
