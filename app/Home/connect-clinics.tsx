import { FastenStitchElement } from '@fastenhealth/fasten-stitch-element-react-native';
import { router } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { apiClient } from '@/lib/api-client';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useIsFeatureEnabled } from '@/hooks/use-feature-permissions';

const FASTEN_PUBLIC_ID = process.env.EXPO_PUBLIC_FASTEN_PUBLIC_ID ?? '';

export default function ConnectClinicsScreen() {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const isConnectClinicEnabled = useIsFeatureEnabled('CONNECT_CLINIC');
  const navigating = useRef(false);
  const [connectedCount, setConnectedCount] = useState(0);
  const [showProcessingModal, setShowProcessingModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEvent = useCallback(async (event: unknown) => {
    let parsed: { event_type?: string; api_mode?: string; data?: Record<string, unknown> } | null = null;

    if (event && typeof event === 'object') {
      const raw = event as Record<string, unknown>;
      if (typeof raw.payload === 'string') {
        try {
          parsed = JSON.parse(raw.payload);
        } catch {
          return;
        }
      } else if (raw.event_type) {
        parsed = raw as { event_type?: string; api_mode?: string; data?: Record<string, unknown> };
      }
    }

    if (!parsed?.event_type) return;
    const eventType = parsed.event_type;

    if (eventType === 'patient.connection_success') {
      setError(null);
      try {
        await apiClient.post('/v1/fasten/connection', {
          api_mode: parsed.api_mode ?? 'test',
          event_type: eventType,
          data: parsed.data ?? {},
        });
        setConnectedCount(c => c + 1);
      } catch (err) {
        console.warn('[ConnectClinics] Failed to record connection:', err);
        setError('Failed to save this connection. Please try again.');
      }
      return;
    }

    if (eventType === 'widget.complete' || eventType === 'widget.close') {
      if (navigating.current) return;
      navigating.current = true;

      if (connectedCount > 0) {
        // User connected new clinics — show processing modal
        setShowProcessingModal(true);
      } else {
        // User closed without connecting anything — go back
        router.back();
      }
    }
  }, [connectedCount]);

  const handleDismissModal = () => {
    setShowProcessingModal(false);
    router.back();
  };

  if (!isConnectClinicEnabled) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text, textAlign: 'center', marginTop: 40, fontSize: getScaledFontSize(16) }}>
          This feature is not available for your account.
        </Text>
      </View>
    );
  }

  if (!FASTEN_PUBLIC_ID) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorTitle, { color: colors.text, fontSize: getScaledFontSize(18) }]}>
          Configuration Missing
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={[styles.backText, { color: colors.primary, fontSize: getScaledFontSize(16) }]}>
            ← Back
          </Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: getScaledFontSize(18) }]}>
          Connect Health Providers
        </Text>
        <View style={styles.backButton} />
      </View>

      {connectedCount > 0 && (
        <View style={styles.successBanner}>
          <Text style={[styles.successBannerText, { fontSize: getScaledFontSize(14) }]}>
            ✓ {connectedCount} new provider{connectedCount > 1 ? 's' : ''} connected
          </Text>
        </View>
      )}

      {error && (
        <View style={[styles.errorBanner, { backgroundColor: colors.card }]}>
          <Text style={[styles.errorBannerText, { color: '#D32F2F', fontSize: getScaledFontSize(14) }]}>
            {error}
          </Text>
        </View>
      )}

      <View style={styles.widgetContainer}>
        <FastenStitchElement publicId={FASTEN_PUBLIC_ID} onEventBus={handleEvent} />
      </View>

      {/* Processing Modal for existing users adding more clinics */}
      <Modal
        visible={showProcessingModal}
        transparent
        animationType="fade"
        onRequestClose={handleDismissModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.modalTitle, { color: colors.text, fontSize: getScaledFontSize(18) }]}>
              Processing Your Request
            </Text>
            <Text style={[styles.modalBody, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
              We are working on connecting your new health providers. We will send you a notification once your data is ready.
            </Text>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: colors.primary }]}
              onPress={handleDismissModal}
            >
              <Text style={[styles.modalButtonText, { fontSize: getScaledFontSize(16) }]}>
                Got it
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
  },
  backButton: { width: 80 },
  backText: { fontWeight: '600' },
  headerTitle: { fontWeight: '700', flex: 1, textAlign: 'center' },
  widgetContainer: { flex: 1 },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  errorTitle: { fontWeight: '700', textAlign: 'center' },
  errorBanner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    borderRadius: 8,
  },
  errorBannerText: { textAlign: 'center' },
  successBanner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#E8F5E9',
  },
  successBannerText: { textAlign: 'center', color: '#2E7D32', fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  modalContent: {
    borderRadius: 16,
    padding: 32,
    gap: 16,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: { fontWeight: '700', textAlign: 'center' },
  modalBody: { textAlign: 'center' },
  modalButton: {
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 12,
    marginTop: 8,
  },
  modalButtonText: { color: '#fff', fontWeight: '700' },
});
