import React, { useEffect, useState, useCallback } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import { AppWrapper } from '@/components/app-wrapper';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useSecurity } from '@/stores/security-store';
import {
  isPinSetup,
  isBiometricEnabled,
  setBiometricEnabled,
  getLockTimeout,
  setLockTimeout,
  verifyPin,
  storePin,
  clearPinData,
} from '@/services/pin-auth';
import { NumberPad } from '@/components/ui/number-pad';
import { PinDots } from '@/components/ui/pin-dots';
import { Modal } from 'react-native';

const TIMEOUT_OPTIONS = [
  { label: '30 seconds', value: 30000 },
  { label: '1 minute', value: 60000 },
  { label: '5 minutes', value: 300000 },
];

export default function SecuritySettingsScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const { refreshSecurityState } = useSecurity();

  const [pinConfigured, setPinConfigured] = useState(false);
  const [biometricOn, setBiometricOn] = useState(false);
  const [hasBiometricHardware, setHasBiometricHardware] = useState(false);
  const [biometricType, setBiometricType] = useState('Face ID');
  const [currentTimeout, setCurrentTimeout] = useState(30000);
  const [showTimeoutPicker, setShowTimeoutPicker] = useState(false);

  // Change PIN modal state
  const [showChangePinModal, setShowChangePinModal] = useState(false);
  const [changePinStep, setChangePinStep] = useState<'current' | 'new' | 'confirm'>('current');
  const [pinInput, setPinInput] = useState('');
  const [newPinValue, setNewPinValue] = useState('');
  const [pinError, setPinError] = useState(false);

  const loadState = useCallback(async () => {
    const pinSet = await isPinSetup();
    setPinConfigured(pinSet);

    const bioEnabled = await isBiometricEnabled();
    setBiometricOn(bioEnabled);

    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    setHasBiometricHardware(compatible && enrolled);

    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      setBiometricType('Face ID');
    } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      setBiometricType('Touch ID');
    }

    const timeout = await getLockTimeout();
    setCurrentTimeout(timeout);
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  const handleToggleBiometric = async (value: boolean) => {
    if (value) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Enable ${biometricType}`,
        cancelLabel: 'Cancel',
        disableDeviceFallback: true,
      });
      if (result.success) {
        await setBiometricEnabled(true);
        setBiometricOn(true);
        await refreshSecurityState();
      }
    } else {
      await setBiometricEnabled(false);
      setBiometricOn(false);
      await refreshSecurityState();
    }
  };

  const handleChangeTimeout = async (ms: number) => {
    await setLockTimeout(ms);
    setCurrentTimeout(ms);
    setShowTimeoutPicker(false);
  };

  const timeoutLabel = TIMEOUT_OPTIONS.find(o => o.value === currentTimeout)?.label ?? '30 seconds';

  // ── Change PIN flow ──

  const openChangePinModal = () => {
    setChangePinStep('current');
    setPinInput('');
    setNewPinValue('');
    setPinError(false);
    setShowChangePinModal(true);
  };

  const handlePinDigit = (digit: string) => {
    if (pinInput.length >= 6) return;
    setPinError(false);
    const next = pinInput + digit;
    setPinInput(next);

    if (next.length === 6) {
      setTimeout(() => handlePinComplete(next), 200);
    }
  };

  const handlePinDelete = () => {
    setPinError(false);
    setPinInput(prev => prev.slice(0, -1));
  };

  const handlePinComplete = async (pin: string) => {
    if (changePinStep === 'current') {
      const valid = await verifyPin(pin);
      if (valid) {
        setChangePinStep('new');
        setPinInput('');
      } else {
        setPinError(true);
        setPinInput('');
      }
    } else if (changePinStep === 'new') {
      setNewPinValue(pin);
      setChangePinStep('confirm');
      setPinInput('');
    } else if (changePinStep === 'confirm') {
      if (pin === newPinValue) {
        await storePin(pin);
        setShowChangePinModal(false);
        Alert.alert('PIN Changed', 'Your PIN has been updated successfully.');
      } else {
        setPinError(true);
        setPinInput('');
        setChangePinStep('new');
        setNewPinValue('');
      }
    }
  };

  const handleResetPin = () => {
    Alert.alert(
      'Reset PIN',
      'This will remove your PIN and biometric settings. You will need to set up a new PIN on next login.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await clearPinData();
            await refreshSecurityState();
            Alert.alert('PIN Reset', 'Your security settings have been cleared. You will be asked to set up a new PIN.');
            router.back();
          },
        },
      ],
    );
  };

  const changePinTitle = changePinStep === 'current'
    ? 'Enter Current PIN'
    : changePinStep === 'new'
      ? 'Enter New PIN'
      : 'Confirm New PIN';

  const changePinSubtitle = changePinStep === 'current'
    ? 'Verify your identity first'
    : changePinStep === 'new'
      ? 'Choose a new 6-digit PIN'
      : 'Re-enter your new PIN';

  return (
    <AppWrapper>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header Icon */}
        <View style={styles.headerSection}>
          <Text style={styles.emoji}>🔒</Text>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(22),
              fontWeight: getScaledFontWeight(700) as any,
              textAlign: 'center',
              marginBottom: 4,
            }}
            accessibilityRole="header"
          >
            Security
          </Text>
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(14),
              textAlign: 'center',
            }}
          >
            Manage your PIN and biometric settings
          </Text>
        </View>

        {/* PIN Section */}
        <View style={styles.section}>
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(13),
              fontWeight: getScaledFontWeight(600) as any,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 12,
              marginLeft: 4,
            }}
          >
            PIN
          </Text>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* PIN Status */}
            <View style={[styles.row, { borderBottomColor: colors.border }]}>
              <View style={styles.rowLeft}>
                <Text style={{ color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }}>
                  PIN Status
                </Text>
              </View>
              <Text
                style={{
                  color: pinConfigured ? '#059669' : '#DC2626',
                  fontSize: getScaledFontSize(14),
                  fontWeight: getScaledFontWeight(600) as any,
                }}
              >
                {pinConfigured ? '✓ Enabled' : '✕ Not Set'}
              </Text>
            </View>

            {/* Change PIN */}
            {pinConfigured && (
              <TouchableOpacity
                style={[styles.row, { borderBottomColor: colors.border }]}
                onPress={openChangePinModal}
                accessibilityRole="button"
                accessibilityLabel="Change PIN"
              >
                <Text style={{ color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }}>
                  Change PIN
                </Text>
                <IconSymbol name="chevron.right" size={getScaledFontSize(18)} color={colors.subtext} />
              </TouchableOpacity>
            )}

            {/* Reset PIN */}
            {pinConfigured && (
              <TouchableOpacity
                style={[styles.row, { borderBottomWidth: 0 }]}
                onPress={handleResetPin}
                accessibilityRole="button"
                accessibilityLabel="Reset PIN"
              >
                <Text style={{ color: '#DC2626', fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }}>
                  Reset PIN
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Biometric Section */}
        {hasBiometricHardware && pinConfigured && (
          <View style={styles.section}>
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(13),
                fontWeight: getScaledFontWeight(600) as any,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 12,
                marginLeft: 4,
              }}
            >
              Biometric
            </Text>

            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.row, { borderBottomWidth: 0 }]}>
                <View style={styles.rowLeft}>
                  <Text style={{ color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }}>
                    {biometricType}
                  </Text>
                  <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginTop: 2 }}>
                    Unlock the app with {biometricType.toLowerCase()}
                  </Text>
                </View>
                <Switch
                  value={biometricOn}
                  onValueChange={handleToggleBiometric}
                  trackColor={{ false: '#E0E0E0', true: colors.tint }}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: biometricOn }}
                  accessibilityLabel={`${biometricType} unlock`}
                />
              </View>
            </View>
          </View>
        )}

        {/* Auto-Lock Section */}
        {pinConfigured && (
          <View style={styles.section}>
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(13),
                fontWeight: getScaledFontWeight(600) as any,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 12,
                marginLeft: 4,
              }}
            >
              Auto-Lock
            </Text>

            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TouchableOpacity
                style={[styles.row, { borderBottomWidth: 0 }]}
                onPress={() => setShowTimeoutPicker(true)}
                accessibilityRole="button"
                accessibilityLabel={`Auto-lock timeout: ${timeoutLabel}`}
              >
                <View style={styles.rowLeft}>
                  <Text style={{ color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }}>
                    Lock After
                  </Text>
                  <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), marginTop: 2 }}>
                    App locks when in background
                  </Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={{ color: colors.tint, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any }}>
                    {timeoutLabel}
                  </Text>
                  <IconSymbol name="chevron.right" size={getScaledFontSize(16)} color={colors.subtext} />
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Timeout Picker Modal */}
      <Modal
        visible={showTimeoutPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTimeoutPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowTimeoutPicker(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(18),
                fontWeight: getScaledFontWeight(600) as any,
                textAlign: 'center',
                marginBottom: 20,
              }}
            >
              Auto-Lock Timer
            </Text>
            {TIMEOUT_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.timeoutOption,
                  {
                    backgroundColor: currentTimeout === option.value ? colors.tint + '15' : 'transparent',
                    borderColor: currentTimeout === option.value ? colors.tint : colors.border,
                  },
                ]}
                onPress={() => handleChangeTimeout(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: currentTimeout === option.value }}
              >
                <Text
                  style={{
                    color: currentTimeout === option.value ? colors.tint : colors.text,
                    fontSize: getScaledFontSize(16),
                    fontWeight: getScaledFontWeight(currentTimeout === option.value ? 600 : 400) as any,
                  }}
                >
                  {option.label}
                </Text>
                {currentTimeout === option.value && (
                  <Text style={{ color: colors.tint, fontSize: getScaledFontSize(18) }}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Change PIN Modal */}
      <Modal
        visible={showChangePinModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowChangePinModal(false)}
      >
        <View style={[styles.pinModalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.pinModalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowChangePinModal(false)} accessibilityLabel="Cancel">
              <Text style={{ color: colors.tint, fontSize: getScaledFontSize(16) }}>Cancel</Text>
            </TouchableOpacity>
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(18),
                fontWeight: getScaledFontWeight(600) as any,
              }}
            >
              Change PIN
            </Text>
            <View style={{ width: 50 }} />
          </View>

          <View style={styles.pinModalContent}>
            <Text style={styles.pinEmoji}>🔑</Text>
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(20),
                fontWeight: getScaledFontWeight(600) as any,
                textAlign: 'center',
                marginBottom: 4,
              }}
            >
              {changePinTitle}
            </Text>
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(14),
                textAlign: 'center',
                marginBottom: 8,
              }}
            >
              {changePinSubtitle}
            </Text>

            <PinDots length={6} filled={pinInput.length} error={pinError} />

            {pinError && (
              <Text
                style={{
                  color: '#DC2626',
                  fontSize: getScaledFontSize(14),
                  textAlign: 'center',
                  marginBottom: 8,
                }}
                accessibilityRole="alert"
              >
                {changePinStep === 'current'
                  ? 'Incorrect PIN. Try again.'
                  : 'PINs didn\'t match. Enter new PIN again.'}
              </Text>
            )}
          </View>

          <NumberPad onDigit={handlePinDigit} onDelete={handlePinDelete} />
          <View style={{ height: 40 }} />
        </View>
      </Modal>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  section: {
    marginBottom: 24,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    minHeight: 54,
  },
  rowLeft: {
    flex: 1,
    marginRight: 12,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  timeoutOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    minHeight: 48,
  },
  pinModalContainer: {
    flex: 1,
  },
  pinModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  pinModalContent: {
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 20,
  },
  pinEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
});
