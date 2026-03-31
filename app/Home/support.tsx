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
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from 'react-native-paper';
import { IconSymbol } from '@/components/ui/icon-symbol';
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <IconSymbol
            name="chevron.right"
            size={getScaledFontSize(24)}
            color={colors.text}
            style={{ transform: [{ rotate: '180deg' }] }}
          />
        </TouchableOpacity>
        <Text
          style={[
            styles.headerTitle,
            {
              color: colors.text,
              fontSize: getScaledFontSize(20),
              fontWeight: getScaledFontWeight(600) as any,
            },
          ]}
        >
          Help & Support
        </Text>
        <View style={{ width: getScaledFontSize(24) }} />
      </View>

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
            <View style={styles.iconContainer}>
              <IconSymbol name="message.fill" size={getScaledFontSize(48)} color={colors.tint} />
            </View>

            <Text
              style={[
                styles.title,
                {
                  color: colors.text,
                  fontSize: getScaledFontSize(22),
                  fontWeight: getScaledFontWeight(700) as any,
                },
              ]}
              accessibilityRole="header"
            >
              How can we help?
            </Text>

            <Text
              style={[
                styles.subtitle,
                {
                  color: colors.subtext,
                  fontSize: getScaledFontSize(14),
                },
              ]}
            >
              Describe your issue below and our team will get back to you within 24-48 hours.
            </Text>

            {/* Description Input */}
            <View style={styles.inputContainer}>
              <Text
                style={[
                  styles.inputLabel,
                  {
                    color: descriptionError ? '#DC2626' : colors.text,
                    fontSize: getScaledFontSize(14),
                    fontWeight: getScaledFontWeight(600) as any,
                  },
                ]}
              >
                Describe your issue
              </Text>
              <TextInput
                style={[
                  styles.textArea,
                  {
                    color: colors.text,
                    fontSize: getScaledFontSize(16),
                    borderColor: descriptionError ? '#DC2626' : colors.border,
                    backgroundColor: descriptionError ? '#FEF2F2' : colors.background,
                  },
                ]}
                placeholder="Tell us what's going on..."
                placeholderTextColor={colors.subtext + '80'}
                value={description}
                onChangeText={(text) => {
                  setDescription(text);
                  if (text.trim().length >= 10) setDescriptionError('');
                }}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                accessibilityLabel="Describe your issue"
                accessibilityHint="Enter at least 10 characters"
              />
              {descriptionError ? (
                <Text
                  style={[styles.errorText, { fontSize: getScaledFontSize(13) }]}
                  accessibilityRole="alert"
                >
                  ⚠️ {descriptionError}
                </Text>
              ) : null}
            </View>

            {/* Submit Button */}
            <Button
              mode="contained"
              onPress={handleSubmit}
              loading={createTicket.isPending}
              disabled={createTicket.isPending}
              style={[styles.submitButton, { backgroundColor: createTicket.isPending ? colors.disabled : colors.tint }]}
              contentStyle={styles.submitContent}
              labelStyle={[
                styles.submitLabel,
                {
                  fontSize: getScaledFontSize(16),
                  fontWeight: getScaledFontWeight(600) as any,
                },
              ]}
              accessibilityLabel="Submit support request"
            >
              Submit Request
            </Button>
          </View>

          {/* Your Requests Section */}
          <View style={styles.ticketsSection}>
            <Text
              style={[
                styles.ticketsSectionTitle,
                {
                  color: colors.text,
                  fontSize: getScaledFontSize(18),
                  fontWeight: getScaledFontWeight(600) as any,
                },
              ]}
              accessibilityRole="header"
            >
              Your Requests
            </Text>

            {isLoadingTickets ? (
              <Text
                style={[
                  styles.loadingText,
                  {
                    color: colors.subtext,
                    fontSize: getScaledFontSize(14),
                  },
                ]}
              >
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
              <View style={[styles.emptyTickets, { backgroundColor: colors.card }]}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>📩</Text>
                <Text
                  style={[
                    styles.emptyTitle,
                    {
                      color: colors.text,
                      fontSize: getScaledFontSize(16),
                      fontWeight: getScaledFontWeight(600) as any,
                    },
                  ]}
                >
                  No Requests Yet
                </Text>
                <Text
                  style={[
                    styles.emptySubtitle,
                    {
                      color: colors.subtext,
                      fontSize: getScaledFontSize(13),
                    },
                  ]}
                >
                  When you submit a support request, it will appear here.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    textAlign: 'center',
    flex: 1,
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
  },
  formSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconContainer: {
    marginBottom: 16,
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
    marginBottom: 28,
  },
  inputContainer: {
    width: '100%',
    marginBottom: 20,
  },
  inputLabel: {
    marginBottom: 8,
    marginLeft: 2,
  },
  textArea: {
    borderWidth: 2,
    borderRadius: 14,
    padding: 16,
    minHeight: 140,
    lineHeight: 22,
  },
  errorText: {
    color: '#DC2626',
    marginTop: 6,
    marginLeft: 2,
  },
  submitButton: {
    borderRadius: 24,
    width: '100%',
  },
  submitContent: {
    minHeight: 50,
  },
  submitLabel: {
    color: '#FFFFFF',
  },
  ticketsSection: {
    marginTop: 8,
  },
  ticketsSectionTitle: {
    marginBottom: 16,
  },
  ticketList: {
    gap: 10,
  },
  ticketItem: {
    marginBottom: 4,
  },
  loadingText: {
    textAlign: 'center',
    paddingVertical: 20,
  },
  emptyTickets: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
    borderRadius: 16,
  },
  emptyTitle: {
    marginBottom: 4,
  },
  emptySubtitle: {
    textAlign: 'center',
  },
});
