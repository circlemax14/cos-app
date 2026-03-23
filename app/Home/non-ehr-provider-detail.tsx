import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
    ActivityIndicator,
    Alert,
    Linking,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Button, Card } from 'react-native-paper';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { InitialsAvatar } from '@/utils/avatar-utils';
import {
    getNonEhrProviders,
    getFilesForProvider,
    upsertAppointmentForNonEhrProvider,
    processAndStoreFiles,
    type NonEhrProvider,
    type NonEhrFile,
    type NonEhrNote,
    type NonEhrAppointment,
} from '@/services/non-ehr-processor';
import { summarizeTreatmentFromFiles, type TreatmentSummaryFile } from '@/services/ai-extractor';
import * as DocumentPicker from 'expo-document-picker';
// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─────────────────────────────────────────────
// Tab definitions
// ─────────────────────────────────────────────

const TABS = [
    { id: 'focus', label: 'Focus of Support' },
    { id: 'notes', label: 'Notes' },
    { id: 'files', label: 'Uploaded Files' },
    { id: 'appointments', label: 'Appointments' },
] as const;

type TabId = (typeof TABS)[number]['id'];

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export default function NonEhrProviderDetailScreen() {
    const params = useLocalSearchParams<{ id: string }>();
    const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
    const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

    const [provider, setProvider] = useState<NonEhrProvider | null>(null);
    const [files, setFiles] = useState<NonEhrFile[]>([]);
    const [activeTab, setActiveTab] = useState<TabId>('focus');
    const [isLoading, setIsLoading] = useState(true);

    // ── AI Treatment Summary ────────────────────
    const [treatmentSummary, setTreatmentSummary] = useState<string | null>(null);
    const [isLoadingSummary, setIsLoadingSummary] = useState(false);
    const [summaryError, setSummaryError] = useState<string | null>(null);
    const isGeneratingSummaryRef = useRef(false);

    // ── Upload ─────────────────────────────────
    const [isUploading, setIsUploading] = useState(false);
    // ── Load data ───────────────────────────────
    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const providers = await getNonEhrProviders();
            const found = providers.find(p => p.id === params.id);
            if (found) {
                setProvider(found);
            }
            if (params.id) {
                const providerFiles = await getFilesForProvider(params.id);
                setFiles(providerFiles);
            }
        } catch (err) {
            console.error('[NonEhrDetail] Error loading data:', err);
        } finally {
            setIsLoading(false);
        }
    }, [params.id]);

    // ── Generate AI treatment summary ───────────
    const generateTreatmentSummary = useCallback(async (providerData: NonEhrProvider, providerFiles: NonEhrFile[]) => {
        if (providerFiles.length === 0 || isGeneratingSummaryRef.current) {
            if (providerFiles.length === 0) setTreatmentSummary(null);
            return;
        }

        isGeneratingSummaryRef.current = true;
        setIsLoadingSummary(true);
        setSummaryError(null);
        try {
            const filesToSend: TreatmentSummaryFile[] = providerFiles.map(f => ({
                id: f.id,
                name: f.name,
                uri: f.uri,
                mimeType: f.mimeType,
                fileName: f.fileName,
            }));
            const summary = await summarizeTreatmentFromFiles(filesToSend);
            setTreatmentSummary(summary);
        } catch (err) {
            console.error('[NonEhrDetail] Error generating treatment summary:', err);
            setSummaryError('Could not generate treatment summary.');
        } finally {
            setIsLoadingSummary(false);
            isGeneratingSummaryRef.current = false;
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Auto-generate summary when data loads
    useEffect(() => {
        if (provider && files.length > 0 && treatmentSummary === null && !isLoadingSummary) {
            generateTreatmentSummary(provider, files);
        }
    }, [provider, files, treatmentSummary, isLoadingSummary, generateTreatmentSummary]);

    // ─────────────────────────────────────────────
    // Actions
    // ─────────────────────────────────────────────

    const handleCall = async () => {
        if (!provider?.phone) return;
        const url = `tel:${provider.phone}`;
        try {
            if (await Linking.canOpenURL(url)) await Linking.openURL(url);
            else Alert.alert('Error', 'Unable to make a phone call');
        } catch {
            Alert.alert('Error', 'Unable to make a phone call');
        }
    };

    const handleEmail = async () => {
        if (!provider?.email) return;
        const url = `mailto:${provider.email}`;
        try {
            if (await Linking.canOpenURL(url)) await Linking.openURL(url);
            else Alert.alert('Error', 'Unable to open email client');
        } catch {
            Alert.alert('Error', 'Unable to open email client');
        }
    };
    const handleUpload = async () => {
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

            setIsUploading(true);
            const uploadResults = await processAndStoreFiles(
                result.assets.map(a => ({
                    name: a.name,
                    uri: a.uri,
                    mimeType: a.mimeType || 'application/octet-stream',
                    size: a.size || 0,
                }))
            );

            const addedCount = uploadResults.filter(r => r.added).length;
            if (addedCount > 0) {
                Alert.alert('Success', `Successfully processed ${addedCount} file(s).`);
                setTreatmentSummary(null); // Reset summary so it regenerates
                await loadData();
            } else if (uploadResults.every(r => r.isDuplicate)) {
                Alert.alert('Info', 'These files have already been uploaded.');
            } else {
                Alert.alert('Error', 'Could not extract information from the selected files.');
            }
        } catch (err) {
            console.error('[NonEhrDetail] Upload error:', err);
            Alert.alert('Error', 'Failed to upload document.');
        } finally {
            setIsUploading(false);
        }
    };

    // ─────────────────────────────────────────────
    // Tab renderers
    // ─────────────────────────────────────────────

    const renderFocusTab = () => (
        <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentPadded}>

            {isLoadingSummary ? (
                <View style={styles.summaryLoading}>
                    <ActivityIndicator size="small" color={colors.tint || '#008080'} />
                    <Text style={[styles.summaryLoadingText, { color: colors.text + '70', fontSize: getScaledFontSize(13) }]}>
                        Analyzing health records…
                    </Text>
                </View>
            ) : summaryError ? (
                <View>
                    <Text style={[styles.emptyText, { color: '#e74c3c', fontSize: getScaledFontSize(13) }]}>
                        {summaryError}
                    </Text>
                    <TouchableOpacity
                        style={[styles.editButton, { borderColor: colors.tint || '#008080', marginTop: 10 }]}
                        onPress={() => provider && generateTreatmentSummary(provider, files)}
                    >
                        <MaterialIcons name="refresh" size={getScaledFontSize(16)} color={colors.tint || '#008080'} />
                        <Text style={[styles.editButtonLabel, { color: colors.tint || '#008080', fontSize: getScaledFontSize(13) }]}>Try Again</Text>
                    </TouchableOpacity>
                </View>
            ) : treatmentSummary ? (
                <Text style={[styles.focusText, { color: colors.text, fontSize: getScaledFontSize(15), lineHeight: 24 }]}>
                    {treatmentSummary}
                </Text>
            ) : (
                <Text style={[styles.emptyText, { color: colors.text + '60', fontSize: getScaledFontSize(14) }]}>
                    {files.length === 0
                        ? 'No files uploaded yet. Upload records to see an AI-generated summary.'
                        : 'No summary available.'}
                </Text>
            )}
        </ScrollView>
    );

    const renderNotesTab = () => {
        const notes = provider?.notes ?? [];

        // Group notes by date string (ignoring time)
        const groupedNotes: Record<string, NonEhrNote[]> = {};
        notes.forEach(note => {
            const dateStr = new Date(note.createdAt).toDateString();
            if (!groupedNotes[dateStr]) groupedNotes[dateStr] = [];
            groupedNotes[dateStr].push(note);
        });

        // Sort dates descending
        const sortedDates = Object.keys(groupedNotes).sort((a, b) =>
            new Date(b).getTime() - new Date(a).getTime()
        );

        return (
            <View style={styles.tabContent}>
                <View style={styles.tabActionRow}>
                    <Text style={[styles.sectionLabel, { color: colors.text + '80', fontSize: getScaledFontSize(12) }]}>
                        NOTES
                    </Text>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                    {notes.length === 0 ? (
                        <Text style={[styles.emptyText, { color: colors.text + '60', fontSize: getScaledFontSize(14) }]}>
                            No visit notes found. Upload health records to extract historical notes.
                        </Text>
                    ) : (
                        sortedDates.map(dateKey => {
                            const dayNotes = groupedNotes[dateKey];
                            const combinedContent = dayNotes.map(n => n.content).join('\n\n');
                            const firstNote = dayNotes[0];

                            return (
                                <Card key={dateKey} style={[styles.noteCard, { backgroundColor: colors.background, marginBottom: 16 }]}>
                                    <Card.Content>
                                        <View style={{ marginBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.text + '10', paddingBottom: 8 }}>
                                            <Text style={[styles.noteDate, { color: colors.tint || '#008080', fontSize: getScaledFontSize(14), fontWeight: '700' }]}>
                                                {new Date(firstNote.createdAt).toLocaleDateString('en-US', {
                                                    weekday: 'short',
                                                    month: 'short',
                                                    day: 'numeric',
                                                    year: 'numeric',
                                                })}
                                            </Text>
                                        </View>
                                        <Text style={[styles.noteContent, { color: colors.text, fontSize: getScaledFontSize(14), lineHeight: 22 }]}>
                                            {combinedContent}
                                        </Text>
                                    </Card.Content>
                                </Card>
                            )
                        })
                    )}
                </ScrollView>
            </View>
        );
    };

    const renderFilesTab = () => (
        <View style={styles.tabContent}>
            <View style={styles.tabActionRow}>
                <Text style={[styles.sectionLabel, { color: colors.text + '80', fontSize: getScaledFontSize(12) }]}>
                    UPLOADED FILES
                </Text>
                <TouchableOpacity
                    style={[styles.addButton, { backgroundColor: colors.tint || '#008080' }]}
                    onPress={handleUpload}
                    disabled={isUploading}
                >
                    {isUploading ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <>
                            <MaterialIcons name="upload-file" size={getScaledFontSize(18)} color="#fff" />
                            <Text style={[styles.addButtonLabel, { fontSize: getScaledFontSize(13) }]}>Upload More</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
                {files.length === 0 ? (
                    <Text style={[styles.emptyText, { color: colors.text + '60', fontSize: getScaledFontSize(14) }]}>
                        No files uploaded for this provider yet.
                    </Text>
                ) : (
                    files.map(file => (
                        <Card key={file.id} style={[styles.fileCard, { backgroundColor: colors.background }]}>
                            <Card.Content>
                                <View style={styles.fileRow}>
                                    <MaterialIcons name="description" size={getScaledFontSize(28)} color={colors.tint || '#008080'} />
                                    <View style={styles.fileInfo}>
                                        <Text style={[styles.fileName, { color: colors.text, fontSize: getScaledFontSize(14) }]} numberOfLines={1}>
                                            {file.fileName}
                                        </Text>
                                        <Text style={[styles.fileMeta, { color: colors.text + '60', fontSize: getScaledFontSize(12) }]}>
                                            {formatFileSize(file.size ?? 0)} •{' '}
                                            {new Date(file.uploadedAt ?? Date.now()).toLocaleDateString('en-US', {
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric',
                                            })}
                                        </Text>
                                    </View>
                                </View>
                            </Card.Content>
                        </Card>
                    ))
                )}
            </ScrollView>
        </View>
    );

    const renderAppointmentsTab = () => {
        const sortedApts = [...(provider?.appointments ?? [])].sort((a, b) => {
            const timeA = new Date(a.date).getTime();
            const timeB = new Date(b.date).getTime();
            return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
        });

        return (
            <View style={styles.tabContent}>
                <View style={styles.tabActionRow}>
                    <Text style={[styles.sectionLabel, { color: colors.text + '80', fontSize: getScaledFontSize(12) }]}>
                        APPOINTMENTS
                    </Text>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                    {sortedApts.length === 0 ? (
                        <Text style={[styles.emptyText, { color: colors.text + '60', fontSize: getScaledFontSize(14) }]}>
                            No appointments recorded yet. Upload records to see your visit history.
                        </Text>
                    ) : (
                        sortedApts.map(apt => renderAppointmentCard(apt))
                    )}
                </ScrollView>
            </View>
        );
    };

    const renderAppointmentCard = (apt: NonEhrAppointment) => (
        <Card key={apt.id} style={[styles.aptCard, { backgroundColor: colors.background }]}>
            <Card.Content>
                <View style={styles.aptRow}>
                    <View>
                        <Text style={[styles.aptDate, { color: colors.text, fontSize: getScaledFontSize(15) }]}>
                            {apt.date}
                        </Text>
                        {apt.time && (
                            <Text style={[styles.aptTime, { color: colors.text + '70', fontSize: getScaledFontSize(13) }]}>
                                {apt.time}
                            </Text>
                        )}
                    </View>
                    <View style={styles.aptRight}>
                        <Text style={[styles.aptType, { color: colors.text + '80', fontSize: getScaledFontSize(13) }]}>
                            {apt.type}
                        </Text>
                        <View
                            style={[
                                styles.aptStatusBadge,
                                { backgroundColor: apt.status === 'Upcoming' ? '#008080' : apt.status === 'Cancelled' ? '#e74c3c' : '#9E9E9E' },
                            ]}
                        >
                            <Text style={[styles.aptStatusText, { fontSize: getScaledFontSize(11) }]}>
                                {apt.status}
                            </Text>
                        </View>
                    </View>
                </View>
            </Card.Content>
        </Card>
    );

    // ─────────────────────────────────────────────
    // Main render
    // ─────────────────────────────────────────────

    if (isLoading) {
        return (
            <AppWrapper>
                <View style={styles.centered}>
                    <Text style={{ color: colors.text }}>Loading…</Text>
                </View>
            </AppWrapper>
        );
    }

    if (!provider) {
        return (
            <AppWrapper>
                <View style={styles.centered}>
                    <Text style={{ color: colors.text }}>Provider not found.</Text>
                    <Button onPress={() => router.back()}>Go Back</Button>
                </View>
            </AppWrapper>
        );
    }

    return (
        <AppWrapper>
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                {/* ── Header ── */}
                <View style={[styles.header, { backgroundColor: colors.background }]}>
                    <View style={styles.headerAvatarRow}>
                        <InitialsAvatar name={provider.providerName} size={72} />
                        <View style={styles.headerInfo}>
                            <Text style={[styles.providerName, { color: colors.text, fontSize: getScaledFontSize(20) }]}>
                                {provider.providerName}
                            </Text>
                            <Text style={[styles.clinicName, { color: colors.text + '80', fontSize: getScaledFontSize(14) }]}>
                                {provider.clinicName}
                            </Text>
                            {provider.specialty && (
                                <Text style={[styles.specialty, { color: colors.tint || '#008080', fontSize: getScaledFontSize(12) }]}>
                                    {provider.specialty}
                                </Text>
                            )}
                        </View>
                    </View>

                    {/* Communication shortcuts */}
                    <View style={styles.commRow}>
                        {provider.phone && (
                            <TouchableOpacity style={[styles.commBtn, { backgroundColor: colors.background }]} onPress={handleCall}>
                                <MaterialIcons name="phone" size={getScaledFontSize(22)} color="#008080" />
                                <Text style={[styles.commLabel, { color: colors.text, fontSize: getScaledFontSize(11) }]}>Call</Text>
                            </TouchableOpacity>
                        )}
                        {provider.email && (
                            <TouchableOpacity style={[styles.commBtn, { backgroundColor: colors.background }]} onPress={handleEmail}>
                                <MaterialIcons name="email" size={getScaledFontSize(22)} color="#008080" />
                                <Text style={[styles.commLabel, { color: colors.text, fontSize: getScaledFontSize(11) }]}>Email</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* ── Tabs ── */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.tabBar}
                    contentContainerStyle={styles.tabBarContent}
                >
                    {TABS.map(tab => (
                        <TouchableOpacity
                            key={tab.id}
                            style={[
                                styles.tab,
                                activeTab === tab.id && { borderBottomColor: colors.tint || '#008080', borderBottomWidth: 2 },
                            ]}
                            onPress={() => setActiveTab(tab.id)}
                        >
                            <Text
                                style={[
                                    styles.tabLabel,
                                    {
                                        color: activeTab === tab.id ? (colors.tint || '#008080') : colors.text + '70',
                                        fontSize: getScaledFontSize(13),
                                        fontWeight: activeTab === tab.id ? '600' : '400',
                                    },
                                ]}
                            >
                                {tab.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* ── Tab content ── */}
                <View style={styles.tabContentWrapper}>
                    {activeTab === 'focus' && renderFocusTab()}
                    {activeTab === 'notes' && renderNotesTab()}
                    {activeTab === 'files' && renderFilesTab()}
                    {activeTab === 'appointments' && renderAppointmentsTab()}
                </View>
            </View>

        </AppWrapper>
    );
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.08)',
        gap: 12,
    },
    headerAvatarRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
    },
    headerInfo: {
        flex: 1,
        gap: 2,
    },
    providerName: {
        fontWeight: '700',
    },
    clinicName: {
        fontWeight: '400',
    },
    specialty: {
        fontWeight: '500',
        marginTop: 2,
    },
    commRow: {
        flexDirection: 'row',
        gap: 12,
    },
    commBtn: {
        alignItems: 'center',
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.1)',
        gap: 4,
    },
    commLabel: {
        fontWeight: '500',
    },
    tabBar: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.08)',
        maxHeight: 44,
    },
    tabBarContent: {
        flexDirection: 'row',
        paddingHorizontal: 8,
    },
    tab: {
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginHorizontal: 2,
    },
    tabLabel: {
        fontWeight: '400',
    },
    tabContentWrapper: {
        flex: 1,
    },
    tabContent: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 16,
    },
    tabContentPadded: {
        paddingBottom: 40,
    },
    tabActionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    sectionLabel: {
        letterSpacing: 0.8,
        fontWeight: '600',
        marginBottom: 8,
    },
    focusText: {
        lineHeight: 22,
    },
    focusInput: {
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
        minHeight: 120,
        lineHeight: 22,
    },
    focusEditContainer: {
        gap: 12,
    },
    focusEditActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 12,
    },
    editButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 14,
        alignSelf: 'flex-start',
    },
    editButtonLabel: {
        fontWeight: '500',
    },
    summaryCard: {
        borderRadius: 12,
        elevation: 1,
        borderWidth: 1,
    },
    summaryLoading: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 8,
    },
    summaryLoadingText: {
        fontStyle: 'italic',
    },
    summaryHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    summaryBadge: {
        fontWeight: '600',
        letterSpacing: 0.3,
    },
    infoCard: {
        borderRadius: 12,
        elevation: 1,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.06)',
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 6,
    },
    infoValue: {
        flex: 1,
    },
    emptyText: {
        lineHeight: 22,
        fontStyle: 'italic',
        marginTop: 8,
    },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderRadius: 8,
        paddingVertical: 7,
        paddingHorizontal: 12,
    },
    addButtonLabel: {
        color: '#fff',
        fontWeight: '600',
    },
    noteCard: {
        marginBottom: 10,
        borderRadius: 10,
        elevation: 1,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.06)',
    },
    noteDate: {
        marginBottom: 4,
        fontWeight: '500',
    },
    noteContent: {
        lineHeight: 20,
    },
    fileCard: {
        marginBottom: 10,
        borderRadius: 10,
        elevation: 1,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.06)',
    },
    fileRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    fileInfo: {
        flex: 1,
    },
    fileName: {
        fontWeight: '500',
    },
    fileMeta: {
        marginTop: 2,
    },
    aptGroupLabel: {
        fontWeight: '600',
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    aptCard: {
        marginBottom: 10,
        borderRadius: 10,
        elevation: 1,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.06)',
    },
    aptRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    aptDate: {
        fontWeight: '600',
    },
    aptTime: {
        marginTop: 2,
    },
    aptRight: {
        alignItems: 'flex-end',
        gap: 6,
    },
    aptType: {
        fontWeight: '500',
    },
    aptStatusBadge: {
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    aptStatusText: {
        color: '#fff',
        fontWeight: '600',
    },
    // Modals
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'flex-end',
    },
    modalBox: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 24,
        gap: 12,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 4,
    },
    modalTextarea: {
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
        minHeight: 100,
        lineHeight: 20,
    },
    modalInput: {
        borderWidth: 1,
        borderRadius: 8,
        padding: 10,
        fontSize: 14,
    },
    modalFieldLabel: {
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.5,
        marginTop: 4,
    },
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 12,
        marginTop: 8,
    },
    statusRow: {
        flexDirection: 'row',
        gap: 8,
        flexWrap: 'wrap',
    },
    statusChip: {
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    statusChipLabel: {
        fontWeight: '600',
        fontSize: 13,
    },
});
