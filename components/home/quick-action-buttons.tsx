import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAccessibility } from '@/stores/accessibility-store';
// SCRUM-653: modals + storage keys + pharmacy catalog moved to the
// shared internals module so `HomeQuickActionPills` (redesigned home)
// and this legacy component read from a single AsyncStorage schema
// and present the same setup/pharmacy UX.
import {
  ContactSetupModal,
  PharmacyPickerModal,
  KEY_PCP,
  KEY_URGENT,
  KEY_PHARMACY,
  type ContactInfo,
  type PharmacyChoice,
  type PharmacyEntry,
} from '@/components/home/quick-action-buttons-internals';

/* ─── Storage ─────────────────────────────────────────────────────── */

async function loadContact(key: string): Promise<ContactInfo | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as ContactInfo) : null;
  } catch {
    return null;
  }
}

async function saveContact(key: string, contact: ContactInfo): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(contact));
}

async function loadPharmacy(): Promise<PharmacyChoice | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PHARMACY);
    return raw ? (JSON.parse(raw) as PharmacyChoice) : null;
  } catch {
    return null;
  }
}

async function savePharmacy(choice: PharmacyChoice): Promise<void> {
  await AsyncStorage.setItem(KEY_PHARMACY, JSON.stringify(choice));
}

/* ─── Helpers ─────────────────────────────────────────────────────── */

/** Strip everything except digits + leading + so `Linking.openURL('tel:…')` is happy on iOS / Android. */
function normalizePhone(input: string): string {
  const cleaned = input.replace(/[^\d+]/g, '');
  return cleaned.startsWith('+') ? cleaned : cleaned.length === 10 ? `+1${cleaned}` : cleaned;
}

async function dialNumber(phone: string): Promise<void> {
  const url = `tel:${phone}`;
  try {
    const ok = await Linking.canOpenURL(url);
    if (!ok) {
      Alert.alert('Cannot place call', 'Calling is not supported on this device.');
      return;
    }
    await Linking.openURL(url);
  } catch {
    Alert.alert('Cannot place call', 'Failed to open the dialer.');
  }
}

async function openPharmacy(p: PharmacyChoice): Promise<void> {
  if (p.appUrl) {
    try {
      const ok = await Linking.canOpenURL(p.appUrl);
      if (ok) {
        await Linking.openURL(p.appUrl);
        return;
      }
    } catch {
      // fall through to webUrl
    }
  }
  await Linking.openURL(p.webUrl);
}

/* ─── Main component ──────────────────────────────────────────────── */

export function QuickActionButtons() {
  const { getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const { width } = useWindowDimensions();
  const isPhone = width < 600;

  const [pcp, setPcp] = useState<ContactInfo | null>(null);
  const [urgent, setUrgent] = useState<ContactInfo | null>(null);
  const [pharmacy, setPharmacy] = useState<PharmacyChoice | null>(null);
  const [loading, setLoading] = useState(true);

  const [pcpModalOpen, setPcpModalOpen] = useState(false);
  const [urgentModalOpen, setUrgentModalOpen] = useState(false);
  const [pharmacyModalOpen, setPharmacyModalOpen] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [pcpData, urgentData, pharmacyData] = await Promise.all([
      loadContact(KEY_PCP),
      loadContact(KEY_URGENT),
      loadPharmacy(),
    ]);
    setPcp(pcpData);
    setUrgent(urgentData);
    setPharmacy(pharmacyData);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const haptic = () => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handlePcpPress = () => {
    haptic();
    if (pcp) dialNumber(pcp.phone);
    else setPcpModalOpen(true);
  };
  const handleUrgentPress = () => {
    haptic();
    if (urgent) dialNumber(urgent.phone);
    else setUrgentModalOpen(true);
  };
  const handlePharmacyPress = () => {
    haptic();
    if (pharmacy) openPharmacy(pharmacy);
    else setPharmacyModalOpen(true);
  };

  return (
    <View style={styles.row}>
      <ActionButton
        primaryLabel={pcp ? `Call ${pcp.name}` : 'Call PCP'}
        secondaryLabel={pcp ? 'PCP' : 'Tap to set up'}
        icon="local-hospital"
        accent="#008080"
        onPress={handlePcpPress}
        loading={loading}
        getScaledFontSize={getScaledFontSize}
        getScaledFontWeight={getScaledFontWeight}
        isPhone={isPhone}
      />
      <ActionButton
        primaryLabel="Pharmacy"
        secondaryLabel={pharmacy ? pharmacy.provider : 'Tap to choose'}
        icon="medication"
        accent="#7C3AED"
        onPress={handlePharmacyPress}
        loading={loading}
        getScaledFontSize={getScaledFontSize}
        getScaledFontWeight={getScaledFontWeight}
        isPhone={isPhone}
      />
      <ActionButton
        primaryLabel={urgent ? `Call ${urgent.name}` : 'Urgent Care'}
        secondaryLabel={urgent ? 'URGENT CARE' : 'Tap to set up'}
        icon="emergency"
        accent="#DC2626"
        onPress={handleUrgentPress}
        loading={loading}
        getScaledFontSize={getScaledFontSize}
        getScaledFontWeight={getScaledFontWeight}
        isPhone={isPhone}
      />

      <ContactSetupModal
        visible={pcpModalOpen}
        onClose={() => setPcpModalOpen(false)}
        title="Set up your PCP"
        subtitle="We'll save your primary care provider's contact so you can call them in one tap next time."
        nameLabel="PCP name"
        namePlaceholder="Dr. Jane Smith"
        accent="#008080"
        onSave={async (name, phone) => {
          const contact = { name, phone, updatedAt: new Date().toISOString() };
          await saveContact(KEY_PCP, contact);
          setPcp(contact);
          setPcpModalOpen(false);
          dialNumber(phone);
        }}
        normalizePhone={normalizePhone}
      />
      <ContactSetupModal
        visible={urgentModalOpen}
        onClose={() => setUrgentModalOpen(false)}
        title="Set up Urgent Care"
        subtitle="Save the contact for your nearest urgent care so it's ready when you need it."
        nameLabel="Urgent care name"
        namePlaceholder="Sonoma Urgent Care"
        accent="#DC2626"
        onSave={async (name, phone) => {
          const contact = { name, phone, updatedAt: new Date().toISOString() };
          await saveContact(KEY_URGENT, contact);
          setUrgent(contact);
          setUrgentModalOpen(false);
          dialNumber(phone);
        }}
        normalizePhone={normalizePhone}
      />
      <PharmacyPickerModal
        visible={pharmacyModalOpen}
        onClose={() => setPharmacyModalOpen(false)}
        onPick={async (entry: PharmacyEntry) => {
          const choice: PharmacyChoice = {
            provider: entry.provider,
            webUrl: entry.webUrl,
            appUrl: entry.appUrl,
            updatedAt: new Date().toISOString(),
          };
          await savePharmacy(choice);
          setPharmacy(choice);
          setPharmacyModalOpen(false);
          openPharmacy(choice);
        }}
      />
    </View>
  );
}

/* ─── Action button (one of three) ────────────────────────────────── */

interface ActionButtonProps {
  primaryLabel: string;
  secondaryLabel: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  accent: string;
  onPress: () => void;
  loading: boolean;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
  isPhone: boolean;
}

function ActionButton({
  primaryLabel,
  secondaryLabel,
  icon,
  accent,
  onPress,
  loading,
  getScaledFontSize,
  getScaledFontWeight,
  isPhone,
}: ActionButtonProps) {
  // SCRUM-265 #19: filled-card design replaces the pale-tint pill.
  // SCRUM-279 (2026-06-08): Ken asked to shrink on phone — buttons
  // were taking too much vertical real estate and the provider-
  // circle initials were overlapping. Tightened minHeight, padding,
  // icon size, and font sizes when isPhone. iPad untouched.
  // Use Math.min on getScaledFontSize so device Large Text settings
  // don't blow the layout.
  const cap = (sz: number) => Math.min(getScaledFontSize(sz), sz * 1.15)
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.button,
        isPhone && styles.buttonPhone,
        {
          backgroundColor: accent,
          // COS-352: Ken asked for a softer, more transparent look on the
          // Call PCP / Pharmacy / Urgent Care buttons. Resting opacity 1 -> 0.85.
          opacity: loading ? 0.55 : pressed ? 0.72 : 0.85,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={primaryLabel}
    >
      <View style={styles.buttonBlob} pointerEvents="none" />
      <View style={[
        styles.iconCircle,
        isPhone && styles.iconCirclePhone,
        { backgroundColor: 'rgba(255,255,255,0.22)' },
      ]}>
        <MaterialIcons name={icon} size={isPhone ? 16 : getScaledFontSize(20)} color="white" />
      </View>
      <Text
        style={{
          color: '#FFFFFF',
          fontSize: isPhone ? cap(11) : getScaledFontSize(13),
          fontWeight: getScaledFontWeight(800) as any,
          textAlign: 'center',
          marginTop: isPhone ? 4 : 10,
          letterSpacing: 0.2,
        }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        allowFontScaling={!isPhone}
      >
        {primaryLabel}
      </Text>
      <Text
        style={{
          color: 'rgba(255,255,255,0.78)',
          fontSize: isPhone ? cap(9) : getScaledFontSize(10),
          fontWeight: getScaledFontWeight(600) as any,
          textAlign: 'center',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginTop: 2,
        }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        allowFontScaling={!isPhone}
      >
        {secondaryLabel}
      </Text>
    </Pressable>
  );
}

/* ─── Styles ──────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  // SCRUM-265 #19: filled-card quick-action design.
  // Solid accent fill, white icon pill, white labels, decorative blob
  // in the corner, soft shadow. Visual weight balances the home grid.
  button: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'flex-start',
    minHeight: 96,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 3,
  },
  // SCRUM-279 (2026-06-08): phone-specific overrides — tighter
  // padding + shorter card. Provider-circle initials were overlapping
  // the 96pt-tall cards on iPhone.
  buttonPhone: {
    paddingVertical: 8,
    paddingHorizontal: 6,
    minHeight: 68,
    borderRadius: 12,
  },
  buttonBlob: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.14)',
    top: -40,
    right: -30,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCirclePhone: { width: 28, height: 28, borderRadius: 10 },
});
