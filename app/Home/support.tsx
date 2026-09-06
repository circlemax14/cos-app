import React, { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
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
import { router } from 'expo-router';
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
 *
 * Two palettes, because a pill is the one place on this screen where the
 * colour carries the meaning. The light pastels put ~8:1 dark-on-light text
 * inside the chip; on a #151718 background those same chips are bright cards
 * of paper, so dark mode inverts to a deep tint with a light foreground —
 * same hue, same meaning, both above 6:1.
 */
const TONE_COLORS: Record<
  'light' | 'dark',
  Record<TicketStatusTone, { bg: string; text: string; border: string }>
> = {
  light: {
    waiting: { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
    active: { bg: '#DBEAFE', text: '#1E40AF', border: '#BFDBFE' },
    done: { bg: '#D1FAE5', text: '#065F46', border: '#A7F3D0' },
    stopped: { bg: '#FEE2E2', text: '#991B1B', border: '#FECACA' },
  },
  dark: {
    waiting: { bg: '#3B2F0B', text: '#FCD34D', border: '#78500F' },
    active: { bg: '#12284D', text: '#93C5FD', border: '#1E4A8A' },
    done: { bg: '#0B3A2C', text: '#6EE7B7', border: '#125A44' },
    stopped: { bg: '#4A1414', text: '#FCA5A5', border: '#7F1D1D' },
  },
};

/**
 * COS-889 — the description cap.
 *
 * 4000 because that is what the server enforces
 * (support-tickets.routes.ts: `description: z.string().trim().min(1).max(4000)`),
 * and support-ticket-detail.tsx already caps a reply at the same number. A
 * smaller number here would be a limit this app invented; a larger one would
 * let a patient write a long account of their problem and lose it to a 400.
 *
 * Enforced with TextInput's own `maxLength`, so typing simply stops. Vishal:
 * "once the character limit is over, then nobody should be able to type
 * anything."
 */
const MAX_DESCRIPTION_LENGTH = 4000;

/** Below this, the counter stops being background information. */
const DESCRIPTION_WARN_AT = 200;

function formatTicketDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function SupportScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  /*
   * #DC2626 on #151718 is 3.4:1 — it fails AA for body text and the "invalid"
   * field background (#FEF2F2) was a sheet of white paper in dark mode. Error
   * state is the one thing a patient must be able to read, so it gets a token
   * per theme like everything else on this screen.
   */
  const dangerText = settings.isDarkTheme ? '#FCA5A5' : '#B91C1C';
  const dangerBorder = settings.isDarkTheme ? '#EF4444' : '#DC2626';
  const dangerSurface = settings.isDarkTheme ? '#2A1516' : '#FEF2F2';
  /*
   * colors.tint (#008080) is 3.4:1 on the dark card — fine for a border, short
   * of AA for the "View details" link text. Same hue, shifted per theme.
   */
  const linkColor = settings.isDarkTheme ? '#4FD1C5' : '#006666';
  const tonePalette = TONE_COLORS[settings.isDarkTheme ? 'dark' : 'light'];
  const canViewScreen = useCanRender('support.view');
  const canContactSupport = useCanRender('support.contact-support');

  const [description, setDescription] = useState('');
  const [descriptionError, setDescriptionError] = useState('');
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [attachmentError, setAttachmentError] = useState('');
  /*
   * COS-880 — no PRE-SELECTED destination.
   *
   * This defaulted to 'AGENCY', so a patient who never touched the control
   * still sent their request to their agency. Vishal asked for the send button
   * to stay disabled "if agency and csh option is there and not selected", and
   * a silent default is the same problem wearing a nicer face: the request
   * goes somewhere the patient did not choose.
   *
   * null means "not chosen yet". A patient with no agency never sees the
   * control and is routed to CSH below, so null only ever blocks the case
   * where a real choice is on screen.
   */
  const [routedTo, setRoutedTo] = useState<SupportRoutedTo | null>(null);

  const { data: tickets, isLoading: isLoadingTickets } = useSupportTickets();
  const createTicket = useCreateSupportTicket();

  /*
   * COS-887 — `agencyId` is NOT the question. `hasElectedAgency` is.
   *
   * This read `Boolean(user.agencyId)`, and ensureUserProfile stamps every new
   * PATIENT with the agency flagged `isDefault: true`. So the id was truthy for
   * patients who have no agency, and they were asked to choose between "my care
   * agency" and "Circle Support Health" — which in production are the same
   * desk. Vishal, testing on an account carrying the default stamp: "where
   * should this go option should only be visible when the patient opted for
   * agency."
   *
   * The server now answers it directly (auth.routes.ts → isElectedAgency),
   * because only the server can see the agency row's isDefault flag. Strict
   * `=== true`: an older backend omits the field, and undefined must read as
   * "no choice", never as one.
   */
  const { data: user } = useUser();
  const hasAgency = user?.hasElectedAgency === true;
  // No agency → no choice, and CSH regardless of what the toggle last held.
  // The server re-derives this from the profile; this only keeps the UI honest.
  const effectiveRoutedTo: SupportRoutedTo = hasAgency ? (routedTo ?? 'CSH') : 'CSH';

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

  /*
   * COS-880 — a request row opens its own screen. It looked inert, so nobody
   * knew: same reason Vishal never opened one. A ticket with no id is not
   * pushed at all, rather than pushing a screen that can only say "not found".
   */
  const handleOpenTicket = useCallback((ticketId?: string | null) => {
    if (!ticketId) return;
    /*
     * COS-886 — the param is `ticketId`, NOT `id`.
     *
     * This pushed `{ id: ticketId }`. The detail screen reads
     * `params.ticketId`, so it resolved to '' — and useSupportTicket is
     * `enabled: ticketId !== ''`, so the query never ran, `isLoading` stayed
     * false and `!ticket` was true. Every row landed on "We could not open
     * this request. Go back and try again." Vishal: "when I click on the view
     * details, it is showing that we cannot open this request."
     *
     * Nothing threw, nothing 404'd, no request was ever made. The screen's own
     * header comment had the correct call all along.
     */
    router.push({ pathname: '/Home/support-ticket-detail', params: { ticketId } } as never);
  }, []);

  const budgetUsed = Math.min(1, attachedBytes / MAX_ATTACHMENT_TOTAL_BYTES);
  const remainingBytes = Math.max(0, MAX_ATTACHMENT_TOTAL_BYTES - attachedBytes);
  const budgetTight = budgetUsed >= 0.85;

  /*
   * COS-880 — one rule for "may this be sent", used by BOTH the disabled state
   * and the handler.
   *
   * The button was disabled only while a request was in flight, so an empty
   * form was submittable and failed with a validation error the patient had to
   * read to discover the rule. Vishal: "send request button needs to be
   * disabled until text is not written and if agency and csh option is there
   * and not selected".
   */
  /*
   * COS-889 — how much room is left, as a number the patient can see BEFORE
   * they hit the wall. maxLength alone stops the typing but explains nothing:
   * the keyboard just goes dead.
   */
  const descriptionRemaining = MAX_DESCRIPTION_LENGTH - description.length;
  const atDescriptionLimit = descriptionRemaining <= 0;

  const needsRoutingChoice = hasAgency && routedTo === null;
  const canSubmit =
    description.trim().length >= 10 && !needsRoutingChoice && !createTicket.isPending;

  /*
   * A disabled button with no explanation is a dead end — the patient taps it,
   * nothing happens, and the rule stays a secret. Same two conditions as
   * canSubmit, read back as a sentence. Empty string while sending, because
   * "Submitting..." already says why it can't be pressed.
   */
  const disabledReason = createTicket.isPending
    ? ''
    : description.trim().length < 10
      ? needsRoutingChoice
        ? 'Add a short description and choose where to send it.'
        : `Add a short description — ${Math.max(1, 10 - description.trim().length)} more character${10 - description.trim().length === 1 ? '' : 's'} to go.`
      : needsRoutingChoice
        ? 'Choose where this should go before sending.'
        : '';

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (description.trim().length < 10) {
      setDescriptionError('Please describe your issue (at least 10 characters)');
      return;
    }
    setDescriptionError('');

    /*
     * COS-889 — the subject was the literal string 'Support Request' on every
     * ticket. So "Your requests" was a column of identical rows, the detail
     * screen led with it in bold, and the admin queue showed the same words
     * for every patient — a title that carries no information is worse than
     * none, because it occupies the one line the reader scans.
     *
     * The patient's own first line is the only thing that tells one request
     * from another. Capped well under the server's 120 so a long first
     * sentence cannot fail validation on a field the patient never filled in.
     */
    const firstLine = description.trim().split('\n')[0].trim();
    const subject =
      firstLine.length > 80 ? `${firstLine.slice(0, 79).trimEnd()}…` : firstLine;

    createTicket.mutate(
      {
        subject,
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
  const scaledFontButton = getScaledFontSize(16);
  const scaledFontSmall = getScaledFontSize(13);
  const scaledFontMedium = getScaledFontSize(15);
  const scaledLineHeight = Math.round(scaledFontInput * 1.4);
  const scaledButtonHeight = Math.max(48, scaledFontButton + 28);
  const scaledTextAreaMinHeight = Math.max(140, scaledFontInput * 8);

  if (!canViewScreen) return <AppWrapper>{null}</AppWrapper>;

  /*
   * COS-889 — the screen reads as four labelled blocks instead of one column
   * of loose controls. Vishal: "if you can improve the UI... It looks very
   * basic."
   *
   * What was basic about it was structure, not decoration: a description box,
   * two attach buttons, a routing panel and a request history all sat directly
   * on the background at the same visual level, so nothing said where one
   * concern ended and the next began. Each is now an eyebrow label over its
   * own card — the same idiom support-ticket-detail.tsx already uses, so the
   * two screens of one feature stop looking like two different features.
   *
   * Still inside the iOS 26 cold-mount envelope: no new react-native import,
   * no new component, no Animated. Cards are a View with a border and a
   * radius.
   */
  const eyebrow = (text: string) => (
    <Text
      style={{
        color: colors.subtext,
        fontSize: scaledFontSmall,
        fontWeight: getScaledFontWeight(700) as any,
        letterSpacing: 0.7,
        textTransform: 'uppercase',
        marginBottom: 8,
        marginLeft: 2,
      }}
    >
      {text}
    </Text>
  );

  const cardTone = { backgroundColor: colors.card, borderColor: colors.border };

  /*
   * The counter is always on screen, even at zero characters — a count that
   * appears only once you are near the limit is a rule you meet by breaking
   * it. Three states: room to spare, running out, full.
   */
  const counterColor = atDescriptionLimit
    ? dangerText
    : descriptionRemaining <= DESCRIPTION_WARN_AT
      ? colors.text
      : colors.subtext;
  const counterText = atDescriptionLimit
    ? 'Character limit reached'
    : `${descriptionRemaining.toLocaleString()} characters left`;

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
          {/* ── Hero ─────────────────────────────────────────────────────
              The emoji used to float alone above the title. In a tinted
              rounded square it reads as an icon someone chose. */}
          <View style={styles.hero}>
            <View style={[styles.heroBadge, { backgroundColor: colors.tint + '1A' }]}>
              <Text style={styles.heroEmoji}>💬</Text>
            </View>
            <Text
              style={{
                color: colors.text,
                fontSize: scaledFontTitle,
                fontWeight: getScaledFontWeight(700) as any,
                textAlign: 'center',
                marginBottom: 6,
              }}
              accessibilityRole="header"
            >
              Help &amp; Support
            </Text>
            <Text
              style={{
                color: colors.subtext,
                fontSize: scaledFontBody,
                textAlign: 'center',
                lineHeight: Math.round(scaledFontBody * 1.5),
                paddingHorizontal: 8,
              }}
            >
              {canContactSupport
                ? "Tell us what's going on and our team will get back to you within 24-48 hours."
                : 'Your past requests and their status are below.'}
            </Text>
          </View>

          {/* ── Describe your issue ──────────────────────────────────── */}
          {canContactSupport && (
            <View style={styles.block}>
              {eyebrow('Describe your issue')}
              <View
                style={[
                  styles.card,
                  cardTone,
                  descriptionError
                    ? { borderColor: dangerBorder, backgroundColor: dangerSurface }
                    : null,
                ]}
              >
                <TextInput
                  style={{
                    color: colors.text,
                    fontSize: scaledFontInput,
                    lineHeight: scaledLineHeight,
                    minHeight: scaledTextAreaMinHeight,
                    padding: 0,
                  }}
                  placeholder="Tell us what's going on..."
                  placeholderTextColor={colors.subtext}
                  value={description}
                  onChangeText={(text) => {
                    setDescription(text);
                    if (text.trim().length >= 10) setDescriptionError('');
                  }}
                  /*
                   * COS-889 — typing stops here, at the same number the server
                   * enforces. Not a warning, not a trim on submit: the 4001st
                   * character is never accepted, so nothing a patient can see
                   * on screen can be silently discarded later.
                   */
                  maxLength={MAX_DESCRIPTION_LENGTH}
                  multiline
                  textAlignVertical="top"
                  editable={!createTicket.isPending}
                  accessibilityLabel="Describe your issue"
                  accessibilityHint={`At least 10 characters, up to ${MAX_DESCRIPTION_LENGTH}`}
                />

                {/* Error on the left, remaining count on the right — one row,
                    so the field never changes height as either appears. */}
                <View style={[styles.counterRow, { borderTopColor: colors.border }]}>
                  <Text
                    style={{
                      color: dangerText,
                      fontSize: scaledFontSmall,
                      flex: 1,
                      marginRight: 8,
                    }}
                    accessibilityRole={descriptionError ? 'alert' : undefined}
                  >
                    {descriptionError}
                  </Text>
                  <Text
                    style={{
                      color: counterColor,
                      fontSize: scaledFontSmall,
                      fontWeight: getScaledFontWeight(
                        descriptionRemaining <= DESCRIPTION_WARN_AT ? 600 : 400,
                      ) as any,
                    }}
                    accessibilityLabel={
                      atDescriptionLimit
                        ? 'Character limit reached'
                        : `${descriptionRemaining} characters remaining`
                    }
                  >
                    {counterText}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* ── Attachments ─────────────────────────────────────────── */}
          {canContactSupport && (
            <View style={styles.block}>
              {eyebrow('Attachments (optional)')}
              <View style={[styles.card, cardTone]}>
                <Text
                  style={{
                    color: colors.subtext,
                    fontSize: scaledFontSmall,
                    lineHeight: Math.round(scaledFontSmall * 1.4),
                    marginBottom: 12,
                  }}
                >
                  PDF, PNG or JPG · up to {MAX_ATTACHMENT_COUNT} files,{' '}
                  {formatBytes(MAX_ATTACHMENT_TOTAL_BYTES)} in total
                </Text>

                <View style={styles.attachRow}>
                  <TouchableOpacity
                    onPress={handlePickDocument}
                    disabled={createTicket.isPending}
                    accessibilityRole="button"
                    accessibilityLabel="Attach a file"
                    style={[
                      styles.attachButton,
                      { borderColor: colors.border, backgroundColor: colors.background },
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
                      { borderColor: colors.border, backgroundColor: colors.background },
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
                    style={[
                      styles.fileRow,
                      { borderColor: colors.border, backgroundColor: colors.background },
                    ]}
                    accessibilityLabel={`${file.name}, ${formatBytes(file.size)}`}
                  >
                    <Text style={{ fontSize: scaledFontBody, marginRight: 8 }}>
                      {file.name.toLowerCase().endsWith('.pdf') ? '📄' : '🖼️'}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: colors.text,
                          fontSize: scaledFontSmall,
                          fontWeight: getScaledFontWeight(600) as any,
                        }}
                      >
                        {file.name}
                      </Text>
                      <Text style={{ color: colors.subtext, fontSize: scaledFontSmall }}>
                        {formatBytes(file.size)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleRemoveFile(file.uri)}
                      disabled={createTicket.isPending}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${file.name}`}
                      accessibilityHint="Removes this file from your request"
                      style={styles.removeButton}
                    >
                      <Text
                        style={{
                          color: dangerText,
                          fontSize: scaledFontSmall,
                          fontWeight: getScaledFontWeight(600) as any,
                        }}
                      >
                        Remove
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}

                {/*
                  The 10 MB cap is a total across every file, which is invisible
                  until the pick that breaks it. The meter makes the budget a
                  thing the patient can watch fill instead of a rule they
                  discover by being refused.
                */}
                {files.length > 0 && (
                  <View style={styles.budgetRow}>
                    <View style={[styles.budgetTrack, { backgroundColor: colors.border }]}>
                      <View
                        style={[
                          styles.budgetFill,
                          {
                            width: `${Math.max(4, Math.round(budgetUsed * 100))}%`,
                            backgroundColor: budgetTight ? dangerBorder : colors.tint,
                          },
                        ]}
                      />
                    </View>
                    <Text
                      style={{
                        color: budgetTight ? dangerText : colors.subtext,
                        fontSize: scaledFontSmall,
                        marginTop: 6,
                      }}
                      accessibilityLabel={`${files.length} of ${MAX_ATTACHMENT_COUNT} files attached, ${formatBytes(remainingBytes)} of the 10 megabyte limit remaining`}
                    >
                      {files.length} of {MAX_ATTACHMENT_COUNT} files ·{' '}
                      {formatBytes(attachedBytes)} used, {formatBytes(remainingBytes)} left
                    </Text>
                  </View>
                )}

                {attachmentError ? (
                  <Text
                    style={{
                      color: dangerText,
                      fontSize: scaledFontSmall,
                      lineHeight: Math.round(scaledFontSmall * 1.4),
                      marginTop: 10,
                    }}
                    accessibilityRole="alert"
                  >
                    {attachmentError}
                  </Text>
                ) : null}
              </View>
            </View>
          )}

          {/* ── Routing — only patients WITH an elected agency get a choice ── */}
          {canContactSupport && hasAgency && (
            <View style={styles.block}>
              {eyebrow('Where should this go?')}
              <View
                style={[
                  styles.card,
                  cardTone,
                  needsRoutingChoice ? { borderColor: colors.tint, borderWidth: 1.5 } : null,
                ]}
              >
                <Text
                  style={{
                    color: colors.subtext,
                    fontSize: scaledFontSmall,
                    lineHeight: Math.round(scaledFontSmall * 1.4),
                    marginBottom: 12,
                  }}
                >
                  Your care agency handles visits, staff and scheduling. Circle Support Health
                  handles the app, your account and billing.
                </Text>
                {/*
                  Stacked full-width rows, not two side-by-side chips.
                  "Circle Support Health" does not fit on one line in half the
                  width, so the two options rendered at different heights with
                  one of them broken across lines — which is also why a radio
                  group is normally a list. The marker sits on the left where a
                  radio's would.
                */}
                <View style={styles.choiceStack}>
                  <TouchableOpacity
                    onPress={() => setRoutedTo('AGENCY')}
                    disabled={createTicket.isPending}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: routedTo === 'AGENCY' }}
                    accessibilityLabel="Send to my care agency"
                    style={[
                      styles.choiceRow,
                      {
                        borderColor: routedTo === 'AGENCY' ? colors.tint : colors.border,
                        backgroundColor: routedTo === 'AGENCY' ? colors.tint : colors.background,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: routedTo === 'AGENCY' ? '#FFFFFF' : colors.subtext,
                        fontSize: scaledFontMedium,
                        marginRight: 10,
                      }}
                    >
                      {routedTo === 'AGENCY' ? '●' : '○'}
                    </Text>
                    <Text
                      style={{
                        color: routedTo === 'AGENCY' ? '#FFFFFF' : colors.text,
                        fontSize: scaledFontSmall,
                        fontWeight: getScaledFontWeight(600) as any,
                        flex: 1,
                      }}
                    >
                      My care agency
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setRoutedTo('CSH')}
                    disabled={createTicket.isPending}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: routedTo === 'CSH' }}
                    accessibilityLabel="Send to Circle Support Health"
                    style={[
                      styles.choiceRow,
                      {
                        borderColor: routedTo === 'CSH' ? colors.tint : colors.border,
                        backgroundColor: routedTo === 'CSH' ? colors.tint : colors.background,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: routedTo === 'CSH' ? '#FFFFFF' : colors.subtext,
                        fontSize: scaledFontMedium,
                        marginRight: 10,
                      }}
                    >
                      {routedTo === 'CSH' ? '●' : '○'}
                    </Text>
                    <Text
                      style={{
                        color: routedTo === 'CSH' ? '#FFFFFF' : colors.text,
                        fontSize: scaledFontSmall,
                        fontWeight: getScaledFontWeight(600) as any,
                        flex: 1,
                      }}
                    >
                      Circle Support Health
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* ── Submit ──────────────────────────────────────────────── */}
          {canContactSupport && (
            <View style={styles.block}>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={!canSubmit}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Submit support request"
                accessibilityHint={disabledReason || undefined}
                accessibilityState={{ disabled: !canSubmit }}
                style={[
                  {
                    /*
                     * Disabled is an OUTLINE, not a grey fill: white on
                     * colors.disabled (#9ca3af) is 2.3:1 and unreadable, and a
                     * grey fill still looks like a button that ought to work.
                     */
                    backgroundColor: canSubmit ? colors.tint : colors.card,
                    borderWidth: canSubmit ? 0 : 1.5,
                    borderColor: colors.border,
                    minHeight: scaledButtonHeight,
                  },
                  styles.submitButton,
                  canSubmit ? styles.submitShadow : null,
                ]}
              >
                <Text
                  style={{
                    color: canSubmit ? '#FFFFFF' : colors.subtext,
                    fontSize: scaledFontButton,
                    fontWeight: getScaledFontWeight(600) as any,
                  }}
                >
                  {createTicket.isPending ? 'Submitting…' : 'Submit request'}
                </Text>
              </TouchableOpacity>

              {disabledReason ? (
                <Text
                  style={{
                    color: colors.subtext,
                    fontSize: scaledFontSmall,
                    textAlign: 'center',
                    lineHeight: Math.round(scaledFontSmall * 1.4),
                    marginTop: 10,
                    paddingHorizontal: 12,
                  }}
                >
                  {disabledReason}
                </Text>
              ) : null}
            </View>
          )}

          {/* ── Your requests ───────────────────────────────────────── */}
          <View style={[styles.ticketsSection, { borderTopColor: colors.border }]}>
            {eyebrow(
              `Your requests${tickets && tickets.length > 0 ? ` (${tickets.length})` : ''}`,
            )}
            <Text
              style={{
                color: colors.subtext,
                fontSize: scaledFontSmall,
                lineHeight: Math.round(scaledFontSmall * 1.4),
                marginBottom: 14,
              }}
            >
              {tickets && tickets.length > 0
                ? 'Tap a request to read the full thread and any replies from our team.'
                : 'Requests you send appear here with a reference number and their current status.'}
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
                Loading your requests…
              </Text>
            ) : tickets && tickets.length > 0 ? (
              <View>
                {tickets.map((ticket) => {
                  const label = ticketStatusLabel(ticket.status);
                  const tone = tonePalette[ticketStatusTone(ticket.status)];
                  const reference = ticket.reference || ticket.ticketId;
                  const date = formatTicketDate(ticket.createdAt);
                  const openable = Boolean(ticket.ticketId);
                  return (
                    <TouchableOpacity
                      key={ticket.ticketId || reference}
                      onPress={() => handleOpenTicket(ticket.ticketId)}
                      disabled={!openable}
                      activeOpacity={0.7}
                      style={[
                        styles.ticketCard,
                        { backgroundColor: colors.card, borderColor: colors.border },
                      ]}
                      accessibilityRole={openable ? 'button' : undefined}
                      accessibilityLabel={`Request ${reference}, ${label}, ${date}`}
                      accessibilityHint={openable ? 'Opens this request' : undefined}
                    >
                      <View style={styles.ticketHeader}>
                        <Text
                          style={{
                            color: colors.subtext,
                            fontSize: scaledFontSmall,
                            fontWeight: getScaledFontWeight(600) as any,
                            flex: 1,
                          }}
                          numberOfLines={1}
                        >
                          {reference}
                        </Text>
                        <View
                          style={[
                            styles.statusPill,
                            { backgroundColor: tone.bg, borderColor: tone.border },
                          ]}
                        >
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
                        style={{
                          color: colors.text,
                          fontSize: scaledFontMedium,
                          fontWeight: getScaledFontWeight(600) as any,
                          lineHeight: Math.round(scaledFontMedium * 1.35),
                          marginBottom: 8,
                        }}
                        numberOfLines={2}
                      >
                        {ticket.subject || ticket.description}
                      </Text>

                      {/*
                        The row IS the link — the chevron is what says so. A
                        card that looks like a read-only summary is why nobody
                        knew these opened.
                      */}
                      <View style={styles.ticketFooter}>
                        <Text
                          style={{ color: colors.subtext, fontSize: scaledFontSmall, flex: 1 }}
                          numberOfLines={1}
                        >
                          {date}
                          {ticket.attachments && ticket.attachments.length > 0
                            ? ` · ${ticket.attachments.length} attachment${ticket.attachments.length > 1 ? 's' : ''}`
                            : ''}
                        </Text>
                        {openable && (
                          <Text
                            style={{
                              color: linkColor,
                              fontSize: scaledFontSmall,
                              fontWeight: getScaledFontWeight(600) as any,
                            }}
                          >
                            View details ›
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View
                style={[
                  styles.emptyTickets,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={styles.emptyEmoji}>📩</Text>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: scaledFontMedium,
                    fontWeight: getScaledFontWeight(600) as any,
                    marginBottom: 6,
                  }}
                >
                  No requests yet
                </Text>
                <Text
                  style={{
                    color: colors.subtext,
                    fontSize: scaledFontSmall,
                    lineHeight: Math.round(scaledFontSmall * 1.45),
                    textAlign: 'center',
                  }}
                >
                  {canContactSupport
                    ? 'Send your first request above. It will show up here with a reference number, and the status updates as our team works on it.'
                    : 'Requests raised on your behalf will show up here with their status.'}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/*
        COS-888 — the whole screen is blocked while the request is in flight.

        The submit button disabled itself and said "Submitting…", but nothing
        else did: the destination chips, the attachment pickers and the text
        box all stayed live, so the form could be edited underneath a request
        that had already left. Vishal: "once I start submitting, there was a
        loader. But I was again able to click on the my agency or support help.
        Ideally, there should be a whole screen loader for this entire support
        screen, so I should not be able to click on anything."

        A Modal rather than an absolutely-positioned View, because the header
        with the menu button belongs to AppWrapper and sits OUTSIDE this
        screen's tree — an overlay in here would leave it tappable. Text only,
        no spinner primitive: this screen renders inside the iOS 26 cold-mount
        envelope. Attachment uploads are the slow part, so it says so.
      */}
      <Modal
        visible={createTicket.isPending}
        transparent
        animationType="fade"
        // Android's hardware back must not dismiss this — the request is
        // already on its way and there is nothing to cancel.
        onRequestClose={() => {}}
      >
        <View
          style={styles.blockingOverlay}
          accessibilityLabel="Sending your request"
          accessibilityLiveRegion="polite"
        >
          <View style={[styles.blockingCard, { backgroundColor: colors.card }]}>
            <Text
              style={{
                color: colors.text,
                fontSize: scaledFontMedium,
                fontWeight: getScaledFontWeight(600) as any,
                textAlign: 'center',
              }}
            >
              Sending your request…
            </Text>
            <Text
              style={{
                color: colors.subtext,
                fontSize: scaledFontSmall,
                textAlign: 'center',
                marginTop: 8,
                lineHeight: Math.round(scaledFontSmall * 1.4),
              }}
            >
              {files.length > 0
                ? `Uploading ${files.length} file${files.length > 1 ? 's' : ''}. Please keep the app open.`
                : 'Please keep the app open.'}
            </Text>
          </View>
        </View>
      </Modal>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  blockingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  blockingCard: {
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 32,
    maxWidth: 320,
    width: '100%',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    flexGrow: 1,
  },
  /* ── COS-889 layout primitives ──────────────────────────────────────
     Four of them, used everywhere, so the spacing rhythm is one decision
     rather than a marginBottom re-chosen per control. */
  hero: {
    alignItems: 'center',
    marginBottom: 28,
  },
  heroBadge: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  heroEmoji: {
    fontSize: 30,
  },
  /* One labelled section: eyebrow + card. */
  block: {
    marginBottom: 22,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  /* Error left, character count right — one row, so the field does not change
     height as either appears. */
  counterRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  submitButton: {
    borderRadius: 26,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  /* Only when it can actually be pressed — a shadow under a disabled control
     is the button promising something it will not do. */
  submitShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
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
  choiceStack: {
    gap: 10,
  },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
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
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  budgetRow: {
    marginTop: 12,
  },
  budgetTrack: {
    height: 5,
    borderRadius: 999,
    overflow: 'hidden',
  },
  budgetFill: {
    height: '100%',
    borderRadius: 999,
  },
  /* A rule above the history so form / routing / history read as three blocks. */
  ticketsSection: {
    marginTop: 10,
    paddingTop: 26,
    borderTopWidth: 1,
  },
  ticketCard: {
    borderWidth: 1,
    borderRadius: 16,
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
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  ticketFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyTickets: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
  },
  emptyEmoji: {
    fontSize: 36,
    marginBottom: 10,
  },
});
