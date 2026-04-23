import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import {
  useEmergencyContacts,
  useCreateEmergencyContact,
  useUpdateEmergencyContact,
  useDeleteEmergencyContact,
  EmergencyContact,
} from '@/hooks/use-emergency-contact';
import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Modal, Alert, ActivityIndicator, TextInput as RNTextInput, RefreshControl } from 'react-native';
import { Card, Button } from 'react-native-paper';
import { IconSymbol } from '@/components/ui/icon-symbol';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface ContactFormValues {
  name: string;
  relationship: string;
  phone: string;
  email: string;
}

const EMPTY_FORM: ContactFormValues = { name: '', relationship: '', phone: '', email: '' };

export default function EmergencyContactScreen() {
  const { settings, getScaledFontWeight, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const { data: emergencyContacts = [], isLoading, isError, refetch } = useEmergencyContacts();
  const createContact = useCreateEmergencyContact();
  const updateContact = useUpdateEmergencyContact();
  const deleteContact = useDeleteEmergencyContact();

  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingContact, setEditingContact] = useState<EmergencyContact | null>(null);
  const [form, setForm] = useState<ContactFormValues>(EMPTY_FORM);

  const openAddModal = () => {
    setEditingContact(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEditModal = (contact: EmergencyContact) => {
    setEditingContact(contact);
    setForm({
      name: contact.name,
      relationship: contact.relationship,
      phone: contact.phone,
      email: contact.email ?? '',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingContact(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert('Error', 'Please enter a name');
      return;
    }
    if (!form.phone.trim()) {
      Alert.alert('Error', 'Please enter a phone number');
      return;
    }
    try {
      if (editingContact) {
        await updateContact.mutateAsync({
          id: editingContact.id,
          name: form.name.trim(),
          relationship: form.relationship.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
        });
        Alert.alert('Success', 'Contact updated');
      } else {
        await createContact.mutateAsync({
          name: form.name.trim(),
          relationship: form.relationship.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
        });
        Alert.alert('Success', 'Contact added');
      }
      closeModal();
    } catch {
      Alert.alert('Error', 'Failed to save contact. Please try again.');
    }
  };

  const handleDelete = (contact: EmergencyContact) => {
    Alert.alert(
      'Delete Contact',
      `Are you sure you want to remove ${contact.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteContact.mutateAsync(contact.id);
              Alert.alert('Success', 'Contact removed');
            } catch {
              Alert.alert('Error', 'Failed to delete contact. Please try again.');
            }
          },
        },
      ]
    );
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } catch {
      // silent fail
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const isSaving = createContact.isPending || updateContact.isPending;

  return (
    <AppWrapper>
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}>
        {/* Title Section */}
        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(24), fontWeight: getScaledFontWeight(600) as any }]}>
            Emergency Contacts
          </Text>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.tint} />
          </View>
        ) : isError ? (
          <View style={styles.loadingContainer}>
            <Text style={[styles.loadingText, { color: colors.text }]}>Failed to load contacts</Text>
            <TouchableOpacity onPress={() => refetch()} style={[styles.retryButton, { backgroundColor: colors.tint }]}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : emergencyContacts.length === 0 ? (
          <Card style={[styles.card, { backgroundColor: colors.cardBackground }]}>
            <Card.Content>
              <View style={styles.emptyContainer}>
                <IconSymbol name="person.crop.circle.badge.exclamationmark" size={getScaledFontSize(48)} color={colors.text + '60'} />
                <Text style={[styles.emptyText, { color: colors.text + '80', fontSize: getScaledFontSize(16) }]}>
                  No emergency contacts found
                </Text>
                <Text style={[styles.emptySubtext, { color: colors.text + '60', fontSize: getScaledFontSize(14) }]}>
                  Add a contact below or they will appear when available from your connected clinics.
                </Text>
              </View>
            </Card.Content>
          </Card>
        ) : (
          emergencyContacts.map((contact, index) => (
            <Card
              key={contact.id}
              style={[
                styles.card,
                {
                  backgroundColor: colors.cardBackground,
                  marginBottom: index < emergencyContacts.length - 1 ? 16 : 0,
                }
              ]}
            >
              <Card.Content>
                {/* Source label for EHR contacts — show clinic when present */}
                {contact.source === 'ehr' && (
                  <View style={styles.ehrBadge}>
                    <MaterialIcons name="local-hospital" size={getScaledFontSize(14)} color={colors.primary} />
                    <Text
                      style={[
                        styles.ehrLabel,
                        {
                          color: colors.primary,
                          fontSize: getScaledFontSize(12),
                          fontWeight: getScaledFontWeight(500) as any,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {contact.clinicName
                        ? `From ${contact.clinicName}`
                        : 'From Medical Records'}
                    </Text>
                  </View>
                )}

                <View style={styles.contactInfo}>
                  <View style={styles.infoRow}>
                    <IconSymbol name="person.fill" size={getScaledFontSize(20)} color={colors.text + '80'} />
                    <View style={styles.infoContent}>
                      <Text style={[styles.label, { color: colors.text + '80', fontSize: getScaledFontSize(12) }]}>Name</Text>
                      <Text style={[styles.value, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}>
                        {contact.name}
                      </Text>
                    </View>
                  </View>

                  {contact.relationship ? (
                    <View style={styles.infoRow}>
                      <IconSymbol name="person.2.fill" size={getScaledFontSize(20)} color={colors.text + '80'} />
                      <View style={styles.infoContent}>
                        <Text style={[styles.label, { color: colors.text + '80', fontSize: getScaledFontSize(12) }]}>Relationship</Text>
                        <Text style={[styles.value, { color: colors.text, fontSize: getScaledFontSize(16) }]}>
                          {contact.relationship}
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  <View style={styles.infoRow}>
                    <IconSymbol name="phone.fill" size={getScaledFontSize(20)} color={colors.text + '80'} />
                    <View style={styles.infoContent}>
                      <Text style={[styles.label, { color: colors.text + '80', fontSize: getScaledFontSize(12) }]}>Phone</Text>
                      <Text style={[styles.value, { color: colors.text, fontSize: getScaledFontSize(16) }]}>
                        {contact.phone}
                      </Text>
                    </View>
                  </View>

                  {contact.email ? (
                    <View style={styles.infoRow}>
                      <IconSymbol name="envelope.fill" size={getScaledFontSize(20)} color={colors.text + '80'} />
                      <View style={styles.infoContent}>
                        <Text style={[styles.label, { color: colors.text + '80', fontSize: getScaledFontSize(12) }]}>Email</Text>
                        <Text style={[styles.value, { color: colors.text, fontSize: getScaledFontSize(16) }]}>
                          {contact.email}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                </View>

                {/* Edit/Delete only for user-created contacts */}
                {contact.source === 'user' && (
                  <View style={styles.contactActions}>
                    <TouchableOpacity onPress={() => openEditModal(contact)} style={styles.actionButton}>
                      <MaterialIcons name="edit" size={getScaledFontSize(20)} color={colors.tint} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(contact)} style={styles.actionButton}>
                      <MaterialIcons name="delete-outline" size={getScaledFontSize(22)} color="#F44336" />
                    </TouchableOpacity>
                  </View>
                )}
              </Card.Content>
            </Card>
          ))
        )}
      </ScrollView>

      {/* FAB — Add Contact */}
      <TouchableOpacity style={[styles.fab, { backgroundColor: colors.tint }]} onPress={openAddModal}>
        <MaterialIcons name="person-add" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Add/Edit Modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(600) as any }]}>
                {editingContact ? 'Edit Contact' : 'Add Contact'}
              </Text>
              <TouchableOpacity onPress={closeModal} style={styles.modalCloseButton}>
                <MaterialIcons name="close" size={getScaledFontSize(24)} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator>
              <Text style={[styles.fieldLabel, { color: colors.text + '80', fontSize: getScaledFontSize(13) }]}>Name *</Text>
              <RNTextInput
                style={[styles.input, { color: colors.text, borderColor: colors.text + '30', fontSize: getScaledFontSize(16) }]}
                value={form.name}
                onChangeText={v => setForm(f => ({ ...f, name: v }))}
                placeholder="Full name"
                placeholderTextColor={colors.text + '40'}
                autoCapitalize="words"
              />

              <Text style={[styles.fieldLabel, { color: colors.text + '80', fontSize: getScaledFontSize(13), marginTop: 12 }]}>Relationship</Text>
              <RNTextInput
                style={[styles.input, { color: colors.text, borderColor: colors.text + '30', fontSize: getScaledFontSize(16) }]}
                value={form.relationship}
                onChangeText={v => setForm(f => ({ ...f, relationship: v }))}
                placeholder="e.g. Spouse, Parent, Sibling"
                placeholderTextColor={colors.text + '40'}
                autoCapitalize="words"
              />

              <Text style={[styles.fieldLabel, { color: colors.text + '80', fontSize: getScaledFontSize(13), marginTop: 12 }]}>Phone *</Text>
              <RNTextInput
                style={[styles.input, { color: colors.text, borderColor: colors.text + '30', fontSize: getScaledFontSize(16) }]}
                value={form.phone}
                onChangeText={v => setForm(f => ({ ...f, phone: v }))}
                placeholder="+1 (555) 000-0000"
                placeholderTextColor={colors.text + '40'}
                keyboardType="phone-pad"
              />

              <Text style={[styles.fieldLabel, { color: colors.text + '80', fontSize: getScaledFontSize(13), marginTop: 12 }]}>Email</Text>
              <RNTextInput
                style={[styles.input, { color: colors.text, borderColor: colors.text + '30', fontSize: getScaledFontSize(16) }]}
                value={form.email}
                onChangeText={v => setForm(f => ({ ...f, email: v }))}
                placeholder="email@example.com"
                placeholderTextColor={colors.text + '40'}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <Button
                mode="outlined"
                onPress={closeModal}
                style={[styles.modalButton, { borderColor: colors.text + '40' }]}
                labelStyle={{ color: colors.text, fontSize: getScaledFontSize(16) }}
                contentStyle={{ paddingVertical: getScaledFontSize(6) }}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={handleSave}
                loading={isSaving}
                disabled={isSaving}
                style={[styles.modalButton, { backgroundColor: colors.tint }]}
                labelStyle={{ color: '#fff', fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }}
                contentStyle={{ paddingVertical: getScaledFontSize(6) }}
              >
                {editingContact ? 'Update' : 'Add'}
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 80, // space for FAB
  },
  titleSection: {
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  card: {
    marginBottom: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  ehrBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  ehrLabel: {
    marginLeft: 4,
  },
  contactInfo: {
    paddingTop: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  infoContent: {
    flex: 1,
    marginLeft: 12,
  },
  label: {
    fontSize: 12,
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
  },
  contactActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
    paddingTop: 8,
    marginTop: 4,
    gap: 8,
  },
  actionButton: {
    padding: 6,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '85%',
    borderRadius: 16,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    flex: 1,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalBody: {
    padding: 20,
  },
  fieldLabel: {
    marginBottom: 6,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 44,
    backgroundColor: 'transparent',
  },
  modalActions: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    borderRadius: 12,
  },
});
