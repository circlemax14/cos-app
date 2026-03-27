/**
 * Integrative Category Screen
 *
 * Two-state design:
 *  (A) Empty state  – no non-EHR providers yet. Allows uploading up to 10 files.
 *  (B) Has-data state – shows connected (non-EHR) providers. Still allows uploading more.
 *
 * File upload → services/non-ehr-processor.ts
 * Provider detail → /Home/non-ehr-provider-detail
 *
 * PDF note: PDFs cannot be text-extracted without a native module.
 * After a PDF upload (or any upload that yields "Unknown Clinic"), a manual-entry
 * modal is shown so the user can enter clinic / provider details themselves.
 */

import { Colors } from '@/constants/theme';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Easing,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    RefreshControl,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { InitialsAvatar } from '@/utils/avatar-utils';
import {
    getNonEhrProviders,
    processAndStoreFiles,
    updateNonEhrProvider,
    type NonEhrProvider,
    type UploadResult,
} from '@/services/non-ehr-processor';

const MAX_FILES_PER_UPLOAD = 10;

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

interface UploadResultRow {
    result: UploadResult;
    fileName: string;
}

function UploadFeedbackItem({ row }: { row: UploadResultRow }) {
    const icon = row.result.isDuplicate ? 'warning' : row.result.added ? 'check-circle' : 'error';
    const color = row.result.isDuplicate ? '#f39c12' : row.result.added ? '#27ae60' : '#e74c3c';
    return (
        <View style={feedbackStyles.row}>
            <MaterialIcons name={icon as any} size={18} color={color} />
            <Text style={[feedbackStyles.text, { color }]}>{row.result.message}</Text>
        </View>
    );
}

const feedbackStyles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
    text: { flex: 1, fontSize: 13 },
});

// ─────────────────────────────────────────────
// Manual Entry Modal
// ─────────────────────────────────────────────

interface ManualEntryData {
    clinicName: string;
    providerName: string;
    specialty: string;
    phone: string;
    address: string;
}

interface ManualEntryModalProps {
    visible: boolean;
    colors: typeof Colors['light'];
    getScaledFontSize: (n: number) => number;
    fileName: string;
    /** Initial values pre-filled from parsing (may be "Unknown Clinic" / filename) */
    initial: ManualEntryData;
    onSave: (data: ManualEntryData) => void;
    onCancel: () => void;
}

function ManualEntryModal({ visible, colors, getScaledFontSize, fileName, initial, onSave, onCancel }: ManualEntryModalProps) {
    const [clinicName, setClinicName] = useState(initial.clinicName === 'Unknown Clinic' ? '' : initial.clinicName);
    const [providerName, setProviderName] = useState(initial.providerName);
    const [specialty, setSpecialty] = useState(initial.specialty);
    const [phone, setPhone] = useState(initial.phone);
    const [address, setAddress] = useState(initial.address);

    // Reset whenever modal opens with new initial values
    useEffect(() => {
        if (visible) {
            setClinicName(initial.clinicName === 'Unknown Clinic' ? '' : initial.clinicName);
            setProviderName(initial.providerName);
            setSpecialty(initial.specialty);
            setPhone(initial.phone);
            setAddress(initial.address);
        }
    }, [visible, initial.clinicName, initial.providerName, initial.specialty, initial.phone, initial.address]);

    const tint = colors.tint || '#008080';

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={mStyles.overlay}
            >
                <View style={[mStyles.box, { backgroundColor: colors.background }]}>
                    <View style={mStyles.headerRow}>
                        <MaterialIcons name="edit-note" size={22} color={tint} />
                        <Text style={[mStyles.title, { color: colors.text, fontSize: getScaledFontSize(17) }]}>
                            Enter Provider Details
                        </Text>
                    </View>
                    <Text style={[mStyles.subtitle, { color: colors.text + '70', fontSize: getScaledFontSize(13) }]}>
                        We couldn&apos;t auto-extract info from{'\n'}
                        <Text style={{ fontWeight: '600', color: colors.text + '90' }}>&quot;{fileName}&quot;</Text>
                        {'\n'}Please fill in the details below.
                    </Text>

                    <ScrollView showsVerticalScrollIndicator={false} style={mStyles.fields}>
                        <Text style={[mStyles.label, { color: colors.text + '70', fontSize: getScaledFontSize(11) }]}>CLINIC / PRACTICE NAME *</Text>
                        <TextInput
                            style={[mStyles.input, { color: colors.text, borderColor: tint, fontSize: getScaledFontSize(15) }]}
                            value={clinicName}
                            onChangeText={setClinicName}
                            placeholder="e.g. Sunrise Wellness Center"
                            placeholderTextColor={colors.text + '40'}
                        />

                        <Text style={[mStyles.label, { color: colors.text + '70', fontSize: getScaledFontSize(11) }]}>PROVIDER / DOCTOR NAME *</Text>
                        <TextInput
                            style={[mStyles.input, { color: colors.text, borderColor: tint, fontSize: getScaledFontSize(15) }]}
                            value={providerName}
                            onChangeText={setProviderName}
                            placeholder="e.g. Dr. Jane Smith"
                            placeholderTextColor={colors.text + '40'}
                        />

                        <Text style={[mStyles.label, { color: colors.text + '70', fontSize: getScaledFontSize(11) }]}>SPECIALTY (optional)</Text>
                        <TextInput
                            style={[mStyles.input, { color: colors.text, borderColor: colors.text + '30', fontSize: getScaledFontSize(15) }]}
                            value={specialty}
                            onChangeText={setSpecialty}
                            placeholder="e.g. Acupuncture, Naturopathy"
                            placeholderTextColor={colors.text + '40'}
                        />

                        <Text style={[mStyles.label, { color: colors.text + '70', fontSize: getScaledFontSize(11) }]}>PHONE (optional)</Text>
                        <TextInput
                            style={[mStyles.input, { color: colors.text, borderColor: colors.text + '30', fontSize: getScaledFontSize(15) }]}
                            value={phone}
                            onChangeText={setPhone}
                            placeholder="e.g. (555) 123-4567"
                            placeholderTextColor={colors.text + '40'}
                            keyboardType="phone-pad"
                        />

                        <Text style={[mStyles.label, { color: colors.text + '70', fontSize: getScaledFontSize(11) }]}>ADDRESS (optional)</Text>
                        <TextInput
                            style={[mStyles.input, { color: colors.text, borderColor: colors.text + '30', fontSize: getScaledFontSize(15) }]}
                            value={address}
                            onChangeText={setAddress}
                            placeholder="e.g. 123 Main St, Austin, TX 78701"
                            placeholderTextColor={colors.text + '40'}
                        />
                    </ScrollView>

                    <View style={mStyles.actions}>
                        <TouchableOpacity style={[mStyles.cancelBtn, { borderColor: colors.text + '30' }]} onPress={onCancel}>
                            <Text style={[mStyles.cancelLabel, { color: colors.text, fontSize: getScaledFontSize(14) }]}>Skip</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[mStyles.saveBtn, { backgroundColor: tint, opacity: (!clinicName.trim() || !providerName.trim()) ? 0.4 : 1 }]}
                            onPress={() => {
                                if (!clinicName.trim() || !providerName.trim()) return;
                                onSave({ clinicName: clinicName.trim(), providerName: providerName.trim(), specialty: specialty.trim(), phone: phone.trim(), address: address.trim() });
                            }}
                            disabled={!clinicName.trim() || !providerName.trim()}
                        >
                            <Text style={[mStyles.saveLabel, { fontSize: getScaledFontSize(14) }]}>Save</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const mStyles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    box: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 24,
        paddingBottom: Platform.OS === 'ios' ? 36 : 24,
        maxHeight: '90%',
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
    title: { fontWeight: '700' },
    subtitle: { marginBottom: 20 },
    fields: { },
    label: { fontWeight: '700', letterSpacing: 0.6, marginBottom: 4, marginTop: 12 },
    input: {
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 2,
    },
    actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
    cancelBtn: {
        flex: 1,
        borderWidth: 1,
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
    },
    cancelLabel: { fontWeight: '500' },
    saveBtn: {
        flex: 2,
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
    },
    saveLabel: { color: '#fff', fontWeight: '700' },
});

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

interface IntegrativeScreenProps {
    onBack?: () => void;
    colors: typeof Colors['light'];
    getScaledFontSize: (size: number) => number;
    getScaledFontWeight: (weight: number) => string | number;
}

/** Returns true if the clinic name or provider name looks like an auto-extraction failure */
function extractionFailed(clinicName: string, providerName: string): boolean {
    return (
        clinicName === 'Unknown Clinic' ||
        clinicName === '' ||
        !clinicName
    );
}

export function IntegrativeScreen({
    onBack,
    colors,
    getScaledFontSize,
    getScaledFontWeight,
}: IntegrativeScreenProps) {
    const [providers, setProviders] = useState<NonEhrProvider[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadResults, setUploadResults] = useState<UploadResultRow[]>([]);
    const [showResults, setShowResults] = useState(false);

    const [refreshing, setRefreshing] = useState(false);

    // Manual entry modal state
    const [manualEntryVisible, setManualEntryVisible] = useState(false);
    const [manualEntryInitial, setManualEntryInitial] = useState<ManualEntryData>({
        clinicName: '',
        providerName: '',
        specialty: '',
        phone: '',
        address: '',
    });
    const [manualEntryFileName, setManualEntryFileName] = useState('');
    // Provider IDs that need manual data filled in
    const pendingManualProviderIds = useRef<string[]>([]);

    // Pulse animation for the empty-state upload button
    const pulse = React.useRef(new Animated.Value(1)).current;
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 1.06, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ])
        ).start();
    }, [pulse]);

    // ── Load providers ──────────────────────────
    const loadProviders = useCallback(async () => {
        setIsLoading(true);
        try {
            const all = await getNonEhrProviders();
            setProviders(all);
        } catch (err) {
            console.error('[IntegrativeScreen] Error loading providers:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadProviders();
    }, [loadProviders]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await loadProviders();
        } catch {
            // silent fail
        } finally {
            setRefreshing(false);
        }
    }, [loadProviders]);

    // ── File upload ──────────────────────────────
    const handlePickAndUpload = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                multiple: true,
                copyToCacheDirectory: true,
                type: ['application/pdf', 'text/plain', 'application/json', '*/*'],
            });

            if (result.canceled) return;

            const { assets } = result;
            if (!assets || assets.length === 0) return;

            if (assets.length > MAX_FILES_PER_UPLOAD) {
                Alert.alert(
                    'Too many files',
                    `You can upload a maximum of ${MAX_FILES_PER_UPLOAD} files at a time. Please select fewer files.`
                );
                return;
            }

            setIsUploading(true);
            setShowResults(false);
            setUploadResults([]);

            const filesToProcess = assets.map((asset: DocumentPicker.DocumentPickerAsset) => ({
                name: asset.name,
                uri: asset.uri,
                mimeType: asset.mimeType ?? 'application/octet-stream',
                size: asset.size ?? 0,
            }));

            const results = await processAndStoreFiles(filesToProcess, MAX_FILES_PER_UPLOAD);

            const rows: UploadResultRow[] = results.map((r, i) => ({
                result: r,
                fileName: filesToProcess[i]?.name ?? `File ${i + 1}`,
            }));

            setUploadResults(rows);
            setShowResults(true);

            // Reload providers to reflect new uploads
            await loadProviders();

            // ── Check if any result needs manual entry ──────────────────────
            // This happens when text extraction failed (e.g. a PDF) and the
            // clinic name fell through to the "Unknown Clinic" placeholder.
            const needsManual = results.filter(
                r => r.added && r.providers.length > 0 && extractionFailed(r.providers[0].clinicName, r.providers[0].providerName)
            );

            if (needsManual.length > 0) {
                const firstResult = needsManual[0];
                const firstProvider = firstResult.providers[0];
                pendingManualProviderIds.current = needsManual.flatMap(r => r.providers.map(p => p.id));

                const matchingRow = rows.find(row =>
                    needsManual.some(r => r.providers.some(p => p.id === firstProvider.id) && row.result === r)
                );

                setManualEntryFileName(matchingRow?.fileName ?? filesToProcess[0]?.name ?? 'file');
                setManualEntryInitial({
                    clinicName: firstProvider.clinicName === 'Unknown Clinic' ? '' : firstProvider.clinicName,
                    providerName: firstProvider.providerName,
                    specialty: firstProvider.specialty ?? '',
                    phone: firstProvider.phone ?? '',
                    address: firstProvider.address ?? '',
                });
                setManualEntryVisible(true);
            }
        } catch (err: unknown) {
            console.error('[IntegrativeScreen] Upload error:', err);
            Alert.alert('Upload Failed', (err instanceof Error ? err.message : null) ?? 'An unexpected error occurred during upload.');
        } finally {
            setIsUploading(false);
        }
    };

    // ── Save manual entry ────────────────────────
    const handleManualSave = async (data: ManualEntryData) => {
        setManualEntryVisible(false);
        try {
            // Apply the user-entered info to every provider that needed it
            for (const providerId of pendingManualProviderIds.current) {
                await updateNonEhrProvider(providerId, {
                    clinicName: data.clinicName,
                    providerName: data.providerName || undefined,
                    specialty: data.specialty || undefined,
                    phone: data.phone || undefined,
                    address: data.address || undefined,
                });
            }
            pendingManualProviderIds.current = [];
            // Reload to show updated names
            await loadProviders();
        } catch (err) {
            console.error('[IntegrativeScreen] Error saving manual entry:', err);
            Alert.alert('Error', 'Could not save provider details. Please try editing from the provider detail page.');
        }
    };

    const handleManualCancel = () => {
        setManualEntryVisible(false);
        pendingManualProviderIds.current = [];
        // Provider was still saved with "Unknown Clinic" — user can edit later
    };

    // ─────────────────────────────────────────────
    // Empty state
    // ─────────────────────────────────────────────

    const renderEmptyState = () => (
        <ScrollView
            contentContainerStyle={[emptyStyles.container]}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
        >
            {/* Header */}
            <View style={emptyStyles.header}>
                <View style={[emptyStyles.iconBubble, { backgroundColor: (colors.tint || '#008080') + '18' }]}>
                    <MaterialIcons name="folder-open" size={getScaledFontSize(52)} color={colors.tint || '#008080'} />
                </View>
                <Text style={[emptyStyles.title, { color: colors.text, fontSize: getScaledFontSize(22) }]}>
                    Add Integrative Providers
                </Text>
                <Text style={[emptyStyles.subtitle, { color: colors.text + '70', fontSize: getScaledFontSize(14) }]}>
                    Upload medical records from providers not connected to your EHR. We&apos;ll extract the provider&apos;s name and clinic automatically — or you can enter them manually for PDFs.
                </Text>
            </View>

            {/* Steps */}
            <View style={emptyStyles.stepsCard}>
                {[
                    { icon: 'upload-file', label: 'Upload up to 10 files at once (PDF, TXT…)' },
                    { icon: 'person-pin', label: 'Clinic & provider names extracted automatically' },
                    { icon: 'edit-note', label: 'For PDFs, enter details manually in a quick form' },
                    { icon: 'folder', label: 'Duplicates are automatically ignored' },
                ].map((step, i) => (
                    <View key={i} style={emptyStyles.step}>
                        <View style={[emptyStyles.stepIcon, { backgroundColor: (colors.tint || '#008080') + '14' }]}>
                            <MaterialIcons name={step.icon as any} size={getScaledFontSize(20)} color={colors.tint || '#008080'} />
                        </View>
                        <Text style={[emptyStyles.stepLabel, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
                            {step.label}
                        </Text>
                    </View>
                ))}
            </View>

            {/* Upload button */}
            <Animated.View style={{ transform: [{ scale: pulse }] }}>
                <TouchableOpacity
                    style={[emptyStyles.uploadButton, { backgroundColor: colors.tint || '#008080' }]}
                    onPress={handlePickAndUpload}
                    disabled={isUploading}
                    activeOpacity={0.8}
                >
                    {isUploading ? (
                        <ActivityIndicator color="#fff" size="small" />
                    ) : (
                        <MaterialIcons name="cloud-upload" size={getScaledFontSize(24)} color="#fff" />
                    )}
                    <Text style={[emptyStyles.uploadButtonLabel, { fontSize: getScaledFontSize(16) }]}>
                        {isUploading ? 'Processing…' : 'Upload Files'}
                    </Text>
                </TouchableOpacity>
            </Animated.View>

            <Text style={[emptyStyles.hint, { color: colors.text + '50', fontSize: getScaledFontSize(12) }]}>
                Supported: PDF, TXT, and other document types • Max {MAX_FILES_PER_UPLOAD} files per upload
            </Text>

            {/* Upload results feedback */}
            {showResults && uploadResults.length > 0 && (
                <View style={[emptyStyles.resultsBox, { borderColor: (colors.tint || '#008080') + '30', backgroundColor: colors.background }]}>
                    {uploadResults.map((row, i) => (
                        <UploadFeedbackItem key={i} row={row} />
                    ))}
                </View>
            )}
        </ScrollView>
    );

    // ─────────────────────────────────────────────
    // Has-data state
    // ─────────────────────────────────────────────

    const renderHasDataState = () => (
        <View style={styles.flex}>
            {/* Upload More strip */}
            <TouchableOpacity
                style={[dataStyles.uploadStrip, { backgroundColor: (colors.tint || '#008080') + '12', borderColor: (colors.tint || '#008080') + '30' }]}
                onPress={handlePickAndUpload}
                disabled={isUploading}
                activeOpacity={0.8}
            >
                {isUploading ? (
                    <ActivityIndicator size="small" color={colors.tint || '#008080'} />
                ) : (
                    <MaterialIcons name="add-circle-outline" size={getScaledFontSize(20)} color={colors.tint || '#008080'} />
                )}
                <Text style={[dataStyles.uploadStripLabel, { color: colors.tint || '#008080', fontSize: getScaledFontSize(14) }]}>
                    {isUploading ? 'Processing files…' : `Add more providers (max ${MAX_FILES_PER_UPLOAD} files)`}
                </Text>
            </TouchableOpacity>

            {/* Upload results */}
            {showResults && uploadResults.length > 0 && (
                <View style={[dataStyles.resultsBox, { borderColor: (colors.tint || '#008080') + '30', backgroundColor: colors.background }]}>
                    {uploadResults.map((row, i) => (
                        <UploadFeedbackItem key={i} row={row} />
                    ))}
                    <TouchableOpacity onPress={() => { setShowResults(false); setUploadResults([]); }}>
                        <Text style={[{ color: colors.tint || '#008080', fontSize: getScaledFontSize(12), marginTop: 6, textAlign: 'right' }]}>
                            Dismiss
                        </Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Provider list */}
            <ScrollView showsVerticalScrollIndicator={false} style={styles.flex} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}>
                <Text style={[dataStyles.sectionLabel, { color: colors.text + '70', fontSize: getScaledFontSize(12) }]}>
                    PROVIDERS ({providers.length})
                </Text>
                {providers.map(provider => (
                    <TouchableOpacity
                        key={provider.id}
                        style={[dataStyles.providerRow, { borderBottomColor: colors.text + '12' }]}
                        onPress={() => router.push({ pathname: '/Home/non-ehr-provider-detail', params: { id: provider.id } })}
                        activeOpacity={0.7}
                    >
                        <InitialsAvatar name={provider.providerName} size={getScaledFontSize(48)} />
                        <View style={dataStyles.providerInfo}>
                            <Text style={[dataStyles.providerName, { color: colors.text, fontSize: getScaledFontSize(15) }]}>
                                {provider.providerName}
                            </Text>
                            <Text style={[dataStyles.clinicName, { color: colors.text + '70', fontSize: getScaledFontSize(13) }]}>
                                {provider.clinicName}
                            </Text>
                            {provider.specialty && (
                                <Text style={[dataStyles.specialty, { color: colors.tint || '#008080', fontSize: getScaledFontSize(12) }]}>
                                    {provider.specialty}
                                </Text>
                            )}
                            <Text style={[dataStyles.meta, { color: colors.text + '50', fontSize: getScaledFontSize(11) }]}>
                                {provider.fileIds.length} {provider.fileIds.length === 1 ? 'file' : 'files'} •{' '}
                                {provider.appointments.length} {provider.appointments.length === 1 ? 'appointment' : 'appointments'}
                            </Text>
                        </View>
                        <MaterialIcons name="chevron-right" size={getScaledFontSize(22)} color={colors.text + '40'} />
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );

    // ─────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────

    return (
        <View style={[styles.flex, { backgroundColor: colors.background }]}>
            {/* Header row with back button */}
            <View style={[styles.headerRow, { borderBottomColor: colors.text + '12' }]}>
                {onBack && (
                    <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <MaterialIcons name="arrow-back" size={getScaledFontSize(22)} color={colors.text} />
                    </TouchableOpacity>
                )}
                <View style={[styles.categoryIconBubble, { backgroundColor: (colors.tint || '#008080') + '18' }]}>
                    <MaterialIcons name="spa" size={getScaledFontSize(22)} color={colors.tint || '#008080'} />
                </View>
                <Text style={[styles.headerTitle, { color: colors.text, fontSize: getScaledFontSize(18) }]}>
                    Integrative
                </Text>
            </View>

            {isLoading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={colors.tint || '#008080'} />
                </View>
            ) : providers.length === 0 ? (
                renderEmptyState()
            ) : (
                renderHasDataState()
            )}

            {/* Manual Entry Modal — shown when PDF/unreadable file is uploaded */}
            <ManualEntryModal
                visible={manualEntryVisible}
                colors={colors}
                getScaledFontSize={getScaledFontSize}
                fileName={manualEntryFileName}
                initial={manualEntryInitial}
                onSave={handleManualSave}
                onCancel={handleManualCancel}
            />
        </View>
    );
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────

const styles = StyleSheet.create({
    flex: { flex: 1 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        gap: 10,
    },
    backBtn: { marginRight: 2 },
    categoryIconBubble: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: { fontWeight: '700', flex: 1 },
});

const emptyStyles = StyleSheet.create({
    container: {
        paddingHorizontal: 24,
        paddingTop: 16,
        paddingBottom: 40,
        alignItems: 'center',
        gap: 20,
    },
    header: {
        alignItems: 'center',
        gap: 12,
        marginBottom: 8,
    },
    iconBubble: {
        width: 100,
        height: 100,
        borderRadius: 50,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    title: {
        fontWeight: '700',
        textAlign: 'center',
    },
    subtitle: {
        textAlign: 'center',
        maxWidth: 320,
    },
    stepsCard: {
        width: '100%',
        backgroundColor: 'rgba(0,128,128,0.05)',
        borderRadius: 14,
        padding: 16,
        gap: 12,
        borderWidth: 1,
        borderColor: 'rgba(0,128,128,0.12)',
    },
    step: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    stepIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    stepLabel: {
        flex: 1,
    },
    uploadButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 14,
        elevation: 2,
        shadowColor: '#008080',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
    },
    uploadButtonLabel: {
        color: '#fff',
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    hint: {
        textAlign: 'center',
    },
    resultsBox: {
        width: '100%',
        borderRadius: 10,
        borderWidth: 1,
        padding: 14,
    },
});

const dataStyles = StyleSheet.create({
    uploadStrip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    uploadStripLabel: {
        fontWeight: '600',
    },
    resultsBox: {
        margin: 12,
        borderRadius: 10,
        borderWidth: 1,
        padding: 12,
    },
    sectionLabel: {
        fontWeight: '700',
        letterSpacing: 0.8,
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 8,
    },
    providerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        gap: 12,
    },
    providerInfo: {
        flex: 1,
        gap: 2,
    },
    providerName: {
        fontWeight: '600',
    },
    clinicName: {
        fontWeight: '400',
    },
    specialty: {
        fontWeight: '500',
    },
    meta: {
        marginTop: 2,
    },
});
