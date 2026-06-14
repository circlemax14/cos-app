import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

/* ─── Storage ─────────────────────────────────────────────────────── */

interface ContactInfo {
  name: string;
  phone: string;
  updatedAt: string;
}

interface PharmacyChoice {
  provider: string;
  webUrl: string;
  appUrl?: string;
  updatedAt: string;
}

const KEY_PCP = 'quickContacts.pcp';
const KEY_URGENT = 'quickContacts.urgentCare';
const KEY_PHARMACY = 'quickContacts.pharmacy';

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

/* ─── Pharmacy catalog ────────────────────────────────────────────── */

interface PharmacyEntry {
  provider: string;
  webUrl: string;
  appUrl?: string;
}

// Major US chains. App schemes verified via published Apple/Play Store
// listings; if the app isn't installed Linking falls back to webUrl.
const PHARMACIES: PharmacyEntry[] = [
  { provider: 'CVS Pharmacy', webUrl: 'https://www.cvs.com/account/login', appUrl: 'CVS://' },
  { provider: 'Walgreens', webUrl: 'https://www.walgreens.com/login.jsp', appUrl: 'walgreensrx://' },
  { provider: 'Walmart Pharmacy', webUrl: 'https://www.walmart.com/cp/pharmacy/5431' },
  { provider: 'Costco Pharmacy', webUrl: 'https://www.costco.com/pharmacy' },
  { provider: 'Rite Aid', webUrl: 'https://www.riteaid.com/pharmacy' },
  { provider: 'Kroger', webUrl: 'https://www.kroger.com/topic/pharmacy' },
  { provider: 'Albertsons / Safeway', webUrl: 'https://www.albertsons.com/pharmacy' },
  { provider: 'Publix', webUrl: 'https://www.publix.com/pharmacy' },
  { provider: 'Target / CVS', webUrl: 'https://www.target.com/c/cvs-pharmacy/-/N-bxnsr' },
  { provider: 'Other (just open my browser)', webUrl: 'https://www.google.com/search?q=pharmacy+near+me' },
];

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
      />
      <PharmacyPickerModal
        visible={pharmacyModalOpen}
        onClose={() => setPharmacyModalOpen(false)}
        onPick={async (entry) => {
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
          opacity: loading ? 0.6 : pressed ? 0.9 : 1,
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

/* ─── Contact setup modal (shared by PCP + Urgent Care) ───────────── */

interface ContactSetupModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  nameLabel: string;
  namePlaceholder: string;
  accent: string;
  onSave: (name: string, phone: string) => Promise<void>;
}

function ContactSetupModal({
  visible,
  onClose,
  title,
  subtitle,
  nameLabel,
  namePlaceholder,
  accent,
  onSave,
}: ContactSetupModalProps) {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setName('');
      setPhone('');
      setSaving(false);
    }
  }, [visible]);

  const canSave = name.trim().length > 1 && normalizePhone(phone).replace(/\D/g, '').length >= 10;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.modalRoot, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <MaterialIcons name="close" size={getScaledFontSize(24)} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <View style={[styles.modalIconCircle, { backgroundColor: accent }]}>
              <MaterialIcons name="phone" size={getScaledFontSize(32)} color="white" />
            </View>
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(22),
                fontWeight: getScaledFontWeight(700) as any,
                textAlign: 'center',
                marginTop: 16,
              }}
            >
              {title}
            </Text>
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(14),
                fontWeight: getScaledFontWeight(400) as any,
                textAlign: 'center',
                marginTop: 8,
                lineHeight: getScaledFontSize(20),
              }}
            >
              {subtitle}
            </Text>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.text, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(600) as any }]}>
                {nameLabel}
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={namePlaceholder}
                placeholderTextColor={colors.subtext}
                autoCapitalize="words"
                style={[
                  styles.input,
                  { borderColor: colors.subtext + '40', color: colors.text, fontSize: getScaledFontSize(15) },
                ]}
              />
            </View>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.text, fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(600) as any }]}>
                Phone number
              </Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="(555) 555-1234"
                placeholderTextColor={colors.subtext}
                keyboardType="phone-pad"
                style={[
                  styles.input,
                  { borderColor: colors.subtext + '40', color: colors.text, fontSize: getScaledFontSize(15) },
                ]}
              />
            </View>

            <TouchableOpacity
              onPress={async () => {
                if (!canSave) return;
                setSaving(true);
                try {
                  await onSave(name.trim(), normalizePhone(phone));
                } finally {
                  setSaving(false);
                }
              }}
              disabled={!canSave || saving}
              style={[
                styles.primaryButton,
                { backgroundColor: accent, opacity: canSave && !saving ? 1 : 0.5 },
              ]}
            >
              {saving ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text
                  style={{
                    color: 'white',
                    fontSize: getScaledFontSize(15),
                    fontWeight: getScaledFontWeight(700) as any,
                  }}
                >
                  Save and call
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

/* ─── Pharmacy picker modal ───────────────────────────────────────── */

interface PharmacyPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onPick: (entry: PharmacyEntry) => Promise<void>;
}

function PharmacyPickerModal({ visible, onClose, onPick }: PharmacyPickerModalProps) {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.modalRoot, { backgroundColor: colors.background }]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <MaterialIcons name="close" size={getScaledFontSize(24)} color={colors.text} />
          </TouchableOpacity>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(17),
              fontWeight: getScaledFontWeight(700) as any,
              flex: 1,
              textAlign: 'center',
              marginRight: getScaledFontSize(24),
            }}
          >
            Choose your pharmacy
          </Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(13),
              fontWeight: getScaledFontWeight(400) as any,
              textAlign: 'center',
              marginBottom: 16,
              lineHeight: getScaledFontSize(20),
            }}
          >
            We&apos;ll remember your choice and open this pharmacy directly next time.
          </Text>
          {PHARMACIES.map((entry) => (
            <TouchableOpacity
              key={entry.provider}
              onPress={() => onPick(entry)}
              style={[styles.pharmacyRow, { borderColor: colors.subtext + '20' }]}
            >
              <View style={[styles.pharmacyIcon, { backgroundColor: '#7C3AED' + '14' }]}>
                <MaterialIcons name="medication" size={getScaledFontSize(20)} color="#7C3AED" />
              </View>
              <Text
                style={{
                  color: colors.text,
                  fontSize: getScaledFontSize(15),
                  fontWeight: getScaledFontWeight(600) as any,
                  flex: 1,
                }}
              >
                {entry.provider}
              </Text>
              <MaterialIcons name="chevron-right" size={getScaledFontSize(20)} color={colors.subtext} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
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
  modalRoot: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalBody: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 32,
    alignItems: 'center',
  },
  modalIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  field: {
    width: '100%',
    marginTop: 16,
  },
  fieldLabel: {
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  primaryButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  pharmacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  pharmacyIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
