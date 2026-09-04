import React, { useCallback, useState } from 'react';
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
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useCanRender } from '@/hooks/use-entitlement';
import { useAccessibility } from '@/stores/accessibility-store';
import { useSupportTickets, useCreateSupportTicket } from '@/hooks/use-support-tickets';
import { useUser } from '@/hooks/use-user';
import { prepareAttachment, type PickedFile, type SupportRoutedTo } from '@/services/api/support';
import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_COUNT,
  MAX_ATTACHMENT_TOTAL_BYTES,
  formatBytes,
  ticketStatusLabel,
  ticketStatusTone,
  type TicketStatusTone,
} from '@/lib/support-attachments';

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

/**
 * Status pill colours. Local rather than SupportStatusConfig in the design
 * system: that map is keyed by the OLD status set (no on_hold, no rejected)
 * and StatusBadge renders NOTHING for a key it doesn't know — which is how a
 * ticket moved to "on hold" would silently lose its status. Keyed by tone, so
 * a status added later still lands in a bucket.
 */
const TONE_COLORS: Record<TicketStatusTone, { bg: string; text: string }> = {
  waiting: { bg: '#FEF3C7', text: '#92400E' },
  active: { bg: '#DBEAFE', text: '#1E40AF' },
  done: { bg: '#D1FAE5', text: '#065F46' },
  stopped: { bg: '#FEE2E2', text: '#991B1B' },
};

function formatTicketDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function SupportScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const canViewScreen = useCanRender('support.view');
  const canContactSupport = useCanRender('support.contact-support');

  const [description, setDescription] = useState('');
  const [descriptionError, setDescriptionError] = useState('');
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [attachmentError, setAttachmentError] = useState('');
  const [routedTo, setRoutedTo] = useState<SupportRoutedTo>('AGENCY');

  const { data: tickets, isLoading: isLoadingTickets } = useSupportTickets();
  const createTicket = useCreateSupportTicket();

  // /v1/auth/me already sits in the query cache (useUser), so the agency check
  // costs no extra request. The type on useUser predates agencyId; the server
  // has returned it since COS-421 (auth.routes.ts → sendSuccess).
  const { data: user } = useUser();
  const hasAgency = Boolean((user as { agencyId?: string | null } | undefined)?.agencyId);
  // No agency → no choice, and CSH regardless of what the toggle last held.
  // The server re-derives this from the profile; this only keeps the UI honest.
  const effectiveRoutedTo: SupportRoutedTo = hasAgency ? routedTo : 'CSH';

  const attachedBytes = files.reduce((sum, f) => sum + f.size, 0);

  /**
   * Validate picked files one at a time against the running total, so the
   * 10 MB cap holds across a multi-select as well as across separate picks.
   * A rejected file is skipped and its reason shown; the rest still attach.
   */
  const stageFiles = useCallback(
    async (candidates: { uri: string; name: string; size?: number | null; mimeType?: string | null }[]) => {
      const staged = [...files];
      let bytes = attachedBytes;
      let message = '';
      for (const candidate of candidates) {
        if (staged.length >= MAX_ATTACHMENT_COUNT) {
          message = `You can attach up to ${MAX_ATTACHMENT_COUNT} files. "${candidate.name}" was not added.`;
          break;
        }
        const result = await prepareAttachment(candidate, bytes);
        if (!result.ok) {
          message = result.message;
          continue;
        }
        staged.push(result.file);
        bytes += result.file.size;
      }
      setFiles(staged);
      setAttachmentError(message);
    },
    [files, attachedBytes],
  );

  const handlePickDocument = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [...ALLOWED_ATTACHMENT_TYPES],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    await stageFiles(
      result.assets.map((a) => ({ uri: a.uri, name: a.name, size: a.size, mimeType: a.mimeType })),
    );
  }, [stageFiles]);

  const handlePickPhoto = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setAttachmentError('Photo library access is needed to attach a photo.');
      return;
    }
    // quality < 1 makes iOS re-encode to JPEG, so a HEIC library photo arrives
    // as an allowed type instead of being rejected at the gate.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.9,
    });
    if (result.canceled) return;
    await stageFiles(
      result.assets.map((a) => ({
        uri: a.uri,
        name: a.fileName ?? a.uri.split('/').pop() ?? 'photo.jpg',
        size: a.fileSize,
        mimeType: a.mimeType,
      })),
    );
  }, [stageFiles]);

  const handleRemoveFile = useCallback((uri: string) => {
    setFiles((current) => current.filter((f) => f.uri !== uri));
    setAttachmentError('');
  }, []);

  const handleSubmit = () => {
    if (description.trim().length < 10) {
      setDescriptionError('Please describe your issue (at least 10 characters)');
      return;
    }
    setDescriptionError('');

    createTicket.mutate(
      {
        subject: 'Support Request',
        description: description.trim(),
        routedTo: effectiveRoutedTo,
        files,
      },
      {
        onSuccess: (result) => {
          const reference = result.reference || result.ticketId;
          Alert.alert(
            'Request submitted',
            reference
              ? `Your reference is ${reference}. We'll get back to you within 24-48 hours.`
              : "We've received your request and will get back to you within 24-48 hours.",
          );
          setDescription('');
          setFiles([]);
          setAttachmentError('');
        },
        onError: () => {
          Alert.alert(
            'Error',
            files.length > 0
              ? 'We could not upload your files, so the request was not sent. Please try again or remove the attachments.'
              : 'Failed to submit your request. Please try again.',
          );
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

  if (!canViewScreen) return <AppWrapper>{null}</AppWrapper>;

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
            {canContactSupport && (
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
            )}

            {/* Attachments — PDF, PNG, JPG, 10 MB across all files */}
            {canContactSupport && (
            <View style={styles.inputContainer}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: scaledFontLabel,
                  fontWeight: getScaledFontWeight(600) as any,
                  marginBottom: 4,
                  marginLeft: 4,
                }}
              >
                Attachments (optional)
              </Text>
              <Text
                style={{
                  color: colors.subtext,
                  fontSize: scaledFontSmall,
                  marginBottom: 10,
                  marginLeft: 4,
                }}
              >
                PDF, PNG or JPG · {formatBytes(attachedBytes)} of{' '}
                {formatBytes(MAX_ATTACHMENT_TOTAL_BYTES)} used
              </Text>

              <View style={styles.attachRow}>
                <TouchableOpacity
                  onPress={handlePickDocument}
                  disabled={createTicket.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Attach a file"
                  style={[
                    styles.attachButton,
                    { borderColor: colors.border, backgroundColor: colors.card },
                  ]}
                >
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: scaledFontSmall,
                      fontWeight: getScaledFontWeight(600) as any,
                    }}
                  >
                    📎 Attach file
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handlePickPhoto}
                  disabled={createTicket.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Attach a photo"
                  style={[
                    styles.attachButton,
                    { borderColor: colors.border, backgroundColor: colors.card },
                  ]}
                >
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: scaledFontSmall,
                      fontWeight: getScaledFontWeight(600) as any,
                    }}
                  >
                    🖼️ Attach photo
                  </Text>
                </TouchableOpacity>
              </View>

              {files.map((file) => (
                <View
                  key={file.uri}
                  style={[styles.fileRow, { borderColor: colors.border }]}
                  accessibilityLabel={`${file.name}, ${formatBytes(file.size)}`}
                >
                  <Text
                    numberOfLines={1}
                    style={{ color: colors.text, fontSize: scaledFontSmall, flex: 1 }}
                  >
                    {file.name}
                  </Text>
                  <Text
                    style={{ color: colors.subtext, fontSize: scaledFontSmall, marginHorizontal: 8 }}
                  >
                    {formatBytes(file.size)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleRemoveFile(file.uri)}
                    disabled={createTicket.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${file.name}`}
                    style={styles.removeButton}
                  >
                    <Text style={{ color: '#DC2626', fontSize: scaledFontBody }}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ))}

              {attachmentError ? (
                <Text
                  style={{
                    color: '#DC2626',
                    fontSize: scaledFontSmall,
                    marginTop: 8,
                    marginLeft: 4,
                  }}
                  accessibilityRole="alert"
                >
                  {attachmentError}
                </Text>
              ) : null}
            </View>
            )}

            {/* Routing — only patients WITH an agency get a choice */}
            {canContactSupport && hasAgency && (
            <View style={styles.inputContainer}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: scaledFontLabel,
                  fontWeight: getScaledFontWeight(600) as any,
                  marginBottom: 10,
                  marginLeft: 4,
                }}
              >
                Where should this go?
              </Text>
              <View style={styles.attachRow}>
                <TouchableOpacity
                  onPress={() => setRoutedTo('AGENCY')}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: routedTo === 'AGENCY' }}
                  accessibilityLabel="Send to my care agency"
                  style={[
                    styles.choiceChip,
                    {
                      borderColor: routedTo === 'AGENCY' ? colors.tint : colors.border,
                      backgroundColor: routedTo === 'AGENCY' ? colors.tint : colors.card,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: routedTo === 'AGENCY' ? '#FFFFFF' : colors.text,
                      fontSize: scaledFontSmall,
                      fontWeight: getScaledFontWeight(600) as any,
                      textAlign: 'center',
                    }}
                  >
                    Send to my care agency
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setRoutedTo('CSH')}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: routedTo === 'CSH' }}
                  accessibilityLabel="Send to Circle Support Health"
                  style={[
                    styles.choiceChip,
                    {
                      borderColor: routedTo === 'CSH' ? colors.tint : colors.border,
                      backgroundColor: routedTo === 'CSH' ? colors.tint : colors.card,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: routedTo === 'CSH' ? '#FFFFFF' : colors.text,
                      fontSize: scaledFontSmall,
                      fontWeight: getScaledFontWeight(600) as any,
                      textAlign: 'center',
                    }}
                  >
                    Send to CSH
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            )}

            {/* Submit Button */}
            {canContactSupport && (
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
            )}
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
                {tickets.map((ticket) => {
                  const label = ticketStatusLabel(ticket.status);
                  const tone = TONE_COLORS[ticketStatusTone(ticket.status)];
                  const reference = ticket.reference || ticket.ticketId;
                  const date = formatTicketDate(ticket.createdAt);
                  return (
                    <View
                      key={ticket.ticketId || reference}
                      style={[
                        styles.ticketCard,
                        { backgroundColor: colors.card, borderColor: colors.border },
                      ]}
                      accessibilityLabel={`Request ${reference}, ${label}, ${date}`}
                    >
                      <View style={styles.ticketHeader}>
                        <Text
                          style={{
                            color: colors.text,
                            fontSize: scaledFontSmall,
                            fontWeight: getScaledFontWeight(700) as any,
                            flex: 1,
                          }}
                          numberOfLines={1}
                        >
                          {reference}
                        </Text>
                        <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
                          <Text
                            style={{
                              color: tone.text,
                              fontSize: scaledFontSmall,
                              fontWeight: getScaledFontWeight(600) as any,
                            }}
                          >
                            {label}
                          </Text>
                        </View>
                      </View>

                      <Text
                        style={{ color: colors.text, fontSize: scaledFontMedium, marginBottom: 4 }}
                        numberOfLines={2}
                      >
                        {ticket.subject || ticket.description}
                      </Text>

                      <Text style={{ color: colors.subtext, fontSize: scaledFontSmall }}>
                        {date}
                        {ticket.attachments && ticket.attachments.length > 0
                          ? ` · ${ticket.attachments.length} attachment${ticket.attachments.length > 1 ? 's' : ''}`
                          : ''}
                      </Text>
                    </View>
                  );
                })}
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
  attachRow: {
    flexDirection: 'row',
    gap: 10,
  },
  attachButton: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  choiceChip: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  removeButton: {
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  ticketsSection: {
    marginTop: 8,
  },
  ticketCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  ticketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
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
