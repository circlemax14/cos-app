/**
 * components/home/quick-action-buttons-internals.tsx
 *   — SCRUM-653 (Home Redesign) shared internals
 *
 * The modals + storage keys + type shape used by BOTH the shipped
 * filled-card `QuickActionButtons` (legacy Home layout) and the
 * redesigned `HomeQuickActionPills` (redesigned layout, gated by
 * HOME_V2_INJECTIONS_ENABLED). Extracted so the two surfaces read
 * from the same AsyncStorage schema and the same modal UX — a change
 * to the pharmacy catalog or the phone-normalization rule ripples to
 * both surfaces atomically.
 *
 * NO BEHAVIOR CHANGE from the shipped implementation in
 * `quick-action-buttons.tsx`. This file is a mechanical extraction:
 * the storage keys, the pharmacy list, both modal components, and
 * their styles are byte-identical to what shipped in SCRUM-265.
 */

import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'

/* ─── Types ────────────────────────────────────────────────────────── */

export interface ContactInfo {
  name: string
  phone: string
  updatedAt: string
}

export interface PharmacyChoice {
  provider: string
  webUrl: string
  appUrl?: string
  updatedAt: string
}

export interface PharmacyEntry {
  provider: string
  webUrl: string
  appUrl?: string
}

/* ─── Storage keys ─────────────────────────────────────────────────── */

export const KEY_PCP = 'quickContacts.pcp'
export const KEY_URGENT = 'quickContacts.urgentCare'
export const KEY_PHARMACY = 'quickContacts.pharmacy'

/* ─── Pharmacy catalog ─────────────────────────────────────────────── */

// Major US chains. App schemes verified via published Apple/Play Store
// listings; if the app isn't installed Linking falls back to webUrl.
export const PHARMACIES: PharmacyEntry[] = [
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
]

/* ─── ContactSetupModal ────────────────────────────────────────────── */

export interface ContactSetupModalProps {
  visible: boolean
  onClose: () => void
  title: string
  subtitle: string
  nameLabel: string
  namePlaceholder: string
  accent: string
  onSave: (name: string, phone: string) => Promise<void>
  /** Phone normalizer, injected so both surfaces stay in sync. */
  normalizePhone: (input: string) => string
}

export function ContactSetupModal({
  visible,
  onClose,
  title,
  subtitle,
  nameLabel,
  namePlaceholder,
  accent,
  onSave,
  normalizePhone,
}: ContactSetupModalProps) {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!visible) {
      setName('')
      setPhone('')
      setSaving(false)
    }
  }, [visible])

  const canSave =
    name.trim().length > 1 &&
    normalizePhone(phone).replace(/\D/g, '').length >= 10

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.modalRoot, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
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
              <Text
                style={[
                  styles.fieldLabel,
                  {
                    color: colors.text,
                    fontSize: getScaledFontSize(13),
                    fontWeight: getScaledFontWeight(600) as any,
                  },
                ]}
              >
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
                  {
                    borderColor: colors.subtext + '40',
                    color: colors.text,
                    fontSize: getScaledFontSize(15),
                  },
                ]}
              />
            </View>
            <View style={styles.field}>
              <Text
                style={[
                  styles.fieldLabel,
                  {
                    color: colors.text,
                    fontSize: getScaledFontSize(13),
                    fontWeight: getScaledFontWeight(600) as any,
                  },
                ]}
              >
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
                  {
                    borderColor: colors.subtext + '40',
                    color: colors.text,
                    fontSize: getScaledFontSize(15),
                  },
                ]}
              />
            </View>

            <TouchableOpacity
              onPress={async () => {
                if (!canSave) return
                setSaving(true)
                try {
                  await onSave(name.trim(), normalizePhone(phone))
                } finally {
                  setSaving(false)
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
  )
}

/* ─── PharmacyPickerModal ──────────────────────────────────────────── */

export interface PharmacyPickerModalProps {
  visible: boolean
  onClose: () => void
  onPick: (entry: PharmacyEntry) => Promise<void>
}

export function PharmacyPickerModal({
  visible,
  onClose,
  onPick,
}: PharmacyPickerModalProps) {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light']
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.modalRoot, { backgroundColor: colors.background }]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
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
  )
}

/* ─── Styles ───────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
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
})
