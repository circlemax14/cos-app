import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Modal, Alert, ActivityIndicator, Switch } from 'react-native';
import { Card, Button, TextInput } from 'react-native-paper';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useProxies, useCreateProxy, useUpdateProxy, useRevokeProxy, ProxyScope, Proxy } from '@/hooks/use-proxies';
import { AppWrapper } from '@/components/app-wrapper';

const SCOPE_LABELS: Record<string, string> = {
  view_appointments: 'View Appointments',
  view_records: 'View Medical Records',
  view_medications: 'View Medications',
  view_labs: 'View Lab Results',
  manage_appointments: 'Manage Appointments',
  view_care_plan: 'View Care Plan',
};

const ALL_SCOPES = Object.keys(SCOPE_LABELS) as ProxyScope[];

export default function ProxyManagementScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const { data: proxies = [], isLoading, isError, refetch } = useProxies();
  const createProxy = useCreateProxy();
  const updateProxy = useUpdateProxy();
  const revokeProxy = useRevokeProxy();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [showEditScopesModal, setShowEditScopesModal] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<ProxyScope[]>([]);
  const [pendingEmail, setPendingEmail] = useState('');
  const [pendingName, setPendingName] = useState('');
  const [pendingScopes, setPendingScopes] = useState<ProxyScope[]>([]);
  const [editingProxy, setEditingProxy] = useState<Proxy | null>(null);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const toggleScope = (scope: ProxyScope, scopes: ProxyScope[], setScopes: (s: ProxyScope[]) => void) => {
    if (scopes.includes(scope)) {
      setScopes(scopes.filter(s => s !== scope));
    } else {
      setScopes([...scopes, scope]);
    }
  };

  const handleAddProxy = () => {
    const trimmedEmail = emailInput.trim();
    const trimmedName = nameInput.trim();
    if (!trimmedEmail) {
      Alert.alert('Error', 'Please enter an email address');
      return;
    }
    if (!validateEmail(trimmedEmail)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }
    if (!trimmedName) {
      Alert.alert('Error', 'Please enter a name');
      return;
    }
    if (selectedScopes.length === 0) {
      Alert.alert('Error', 'Please select at least one permission scope');
      return;
    }
    if (proxies.some(p => p.email.toLowerCase() === trimmedEmail.toLowerCase())) {
      Alert.alert('Error', 'This proxy already exists');
      return;
    }
    setPendingEmail(trimmedEmail);
    setPendingName(trimmedName);
    setPendingScopes(selectedScopes);
    setShowAddModal(false);
    setShowConsentModal(true);
  };

  const handleConsentYes = async () => {
    setShowConsentModal(false);
    try {
      await createProxy.mutateAsync({ email: pendingEmail, name: pendingName, scopes: pendingScopes });
      setEmailInput('');
      setNameInput('');
      setSelectedScopes([]);
      setPendingEmail('');
      setPendingName('');
      setPendingScopes([]);
      Alert.alert('Success', 'Proxy has been added successfully');
    } catch {
      Alert.alert('Error', 'Failed to add proxy. Please try again.');
    }
  };

  const handleConsentNo = () => {
    setShowConsentModal(false);
    setPendingEmail('');
    setPendingName('');
    setPendingScopes([]);
    setShowAddModal(true);
  };

  const handleRevokeProxy = (proxyId: string, email: string) => {
    Alert.alert(
      'Remove Proxy',
      `Are you sure you want to remove ${email} as a proxy?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await revokeProxy.mutateAsync(proxyId);
              Alert.alert('Success', 'Proxy has been removed');
            } catch {
              Alert.alert('Error', 'Failed to remove proxy. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleOpenEditScopes = (proxy: Proxy) => {
    setEditingProxy(proxy);
    setSelectedScopes([...proxy.scopes]);
    setShowEditScopesModal(true);
  };

  const handleSaveEditScopes = async () => {
    if (!editingProxy) return;
    if (selectedScopes.length === 0) {
      Alert.alert('Error', 'Please select at least one permission scope');
      return;
    }
    try {
      await updateProxy.mutateAsync({ id: editingProxy.id, scopes: selectedScopes });
      setShowEditScopesModal(false);
      setEditingProxy(null);
      setSelectedScopes([]);
      Alert.alert('Success', 'Proxy permissions updated');
    } catch {
      Alert.alert('Error', 'Failed to update proxy. Please try again.');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#4CAF50';
      case 'pending': return '#FF9800';
      case 'revoked': return '#F44336';
      default: return colors.text + '80';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'Active';
      case 'pending': return 'Pending';
      case 'revoked': return 'Revoked';
      default: return status;
    }
  };

  const renderScopeToggles = (scopes: ProxyScope[], setScopes: (s: ProxyScope[]) => void) => (
    <View style={styles.scopesList}>
      {ALL_SCOPES.map(scope => (
        <View key={scope} style={styles.scopeRow}>
          <Text style={[styles.scopeLabel, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
            {SCOPE_LABELS[scope]}
          </Text>
          <Switch
            value={scopes.includes(scope)}
            onValueChange={() => toggleScope(scope, scopes, setScopes)}
            trackColor={{ false: colors.text + '30', true: colors.tint }}
          />
        </View>
      ))}
    </View>
  );

  return (
    <AppWrapper>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Description */}
        <Card style={[styles.infoCard, { backgroundColor: colors.background }]}>
          <Card.Content>
            <Text style={[styles.infoText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any }]}>
              Proxies are individuals you authorize to access your health information. They can view and manage your medical records on your behalf.
            </Text>
          </Card.Content>
        </Card>

        {/* Add Proxy Button */}
        <Button
          mode="contained"
          onPress={() => {
            setEmailInput('');
            setNameInput('');
            setSelectedScopes([]);
            setShowAddModal(true);
          }}
          style={[styles.addButton, { backgroundColor: colors.tint }]}
          labelStyle={{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any, color: '#fff' }}
          icon={() => <MaterialIcons name="person-add" size={getScaledFontSize(20)} color="#fff" />}
        >
          Add Proxy
        </Button>

        {/* Proxies List */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.tint} />
            <Text style={[styles.loadingText, { color: colors.text + '80', fontSize: getScaledFontSize(14) }]}>
              Loading proxies...
            </Text>
          </View>
        ) : isError ? (
          <View style={styles.loadingContainer}>
            <Text style={[styles.loadingText, { color: colors.text + '80', fontSize: getScaledFontSize(14) }]}>
              Failed to load proxies
            </Text>
            <TouchableOpacity onPress={() => refetch()} style={[styles.retryButton, { backgroundColor: colors.tint }]}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : proxies.length === 0 ? (
          <Card style={[styles.emptyCard, { backgroundColor: colors.background }]}>
            <Card.Content>
              <View style={styles.emptyContent}>
                <MaterialIcons name="people-outline" size={getScaledFontSize(48)} color={colors.text + '60'} />
                <Text style={[styles.emptyText, { color: colors.text + '80', fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }]}>
                  No proxies assigned
                </Text>
                <Text style={[styles.emptySubtext, { color: colors.text + '60', fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any }]}>
                  Add a proxy to grant access to your health information
                </Text>
              </View>
            </Card.Content>
          </Card>
        ) : (
          <View style={styles.proxiesList}>
            {proxies.map((proxy) => (
              <Card key={proxy.id} style={[styles.proxyCard, { backgroundColor: colors.background }]}>
                <Card.Content>
                  <View style={styles.proxyContent}>
                    <View style={styles.proxyInfo}>
                      <View style={styles.proxyHeader}>
                        <MaterialIcons name="email" size={getScaledFontSize(20)} color={colors.tint} />
                        <Text style={[styles.proxyEmail, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}>
                          {proxy.email}
                        </Text>
                      </View>
                      {proxy.name ? (
                        <Text style={[{ color: colors.text + '80', fontSize: getScaledFontSize(13), marginBottom: 6 }]}>
                          {proxy.name}
                        </Text>
                      ) : null}
                      <View style={styles.proxyStatusRow}>
                        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(proxy.status) + '20' }]}>
                          <View style={[styles.statusDot, { backgroundColor: getStatusColor(proxy.status) }]} />
                          <Text style={[styles.statusText, { color: getStatusColor(proxy.status), fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(500) as any }]}>
                            {getStatusLabel(proxy.status)}
                          </Text>
                        </View>
                        {proxy.acceptedAt && (
                          <Text style={[styles.consentDate, { color: colors.text + '60', fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(400) as any }]}>
                            Added {new Date(proxy.acceptedAt).toLocaleDateString()}
                          </Text>
                        )}
                      </View>
                      {/* Scope summary */}
                      {proxy.scopes.length > 0 && (
                        <View style={styles.scopeSummary}>
                          {proxy.scopes.slice(0, 3).map(scope => (
                            <View key={scope} style={[styles.scopeChip, { backgroundColor: colors.tint + '20' }]}>
                              <Text style={[styles.scopeChipText, { color: colors.tint, fontSize: getScaledFontSize(11) }]}>
                                {SCOPE_LABELS[scope] ?? scope}
                              </Text>
                            </View>
                          ))}
                          {proxy.scopes.length > 3 && (
                            <Text style={[{ color: colors.text + '60', fontSize: getScaledFontSize(11) }]}>
                              +{proxy.scopes.length - 3} more
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                    <View style={styles.proxyActions}>
                      <TouchableOpacity
                        onPress={() => handleOpenEditScopes(proxy)}
                        style={styles.editButton}
                      >
                        <MaterialIcons name="edit" size={getScaledFontSize(22)} color={colors.tint} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleRevokeProxy(proxy.id, proxy.email)}
                        style={styles.removeButton}
                      >
                        <MaterialIcons name="delete-outline" size={getScaledFontSize(24)} color="#F44336" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </Card.Content>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Add Proxy Modal */}
      <Modal
        visible={showAddModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.addModalContent, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(600) as any }]}>
                Add Proxy
              </Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)} style={styles.modalCloseButton}>
                <MaterialIcons name="close" size={getScaledFontSize(24)} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator>
              <View style={styles.addModalBody}>
                <Text style={[styles.inputLabel, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any }]}>
                  Full Name
                </Text>
                <TextInput
                  mode="outlined"
                  value={nameInput}
                  onChangeText={setNameInput}
                  placeholder="Proxy's full name"
                  autoCapitalize="words"
                  style={styles.emailInput}
                  contentStyle={{ fontSize: getScaledFontSize(16) }}
                  outlineStyle={{ borderColor: colors.text + '40', borderRadius: 12 }}
                />

                <Text style={[styles.inputLabel, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any, marginTop: 12 }]}>
                  Email Address
                </Text>
                <TextInput
                  mode="outlined"
                  value={emailInput}
                  onChangeText={setEmailInput}
                  placeholder="proxy@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={styles.emailInput}
                  contentStyle={{ fontSize: getScaledFontSize(16) }}
                  outlineStyle={{ borderColor: colors.text + '40', borderRadius: 12 }}
                />

                <Text style={[styles.inputLabel, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any, marginTop: 16 }]}>
                  Permissions
                </Text>
                {renderScopeToggles(selectedScopes, setSelectedScopes)}
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <Button
                mode="outlined"
                onPress={() => setShowAddModal(false)}
                style={[styles.modalButton, { borderColor: colors.text + '40' }]}
                labelStyle={{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any, color: colors.text }}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={handleAddProxy}
                style={[styles.modalButton, { backgroundColor: colors.tint }]}
                labelStyle={{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any, color: '#fff' }}
              >
                Continue
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* Consent Modal */}
      <Modal
        visible={showConsentModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleConsentNo}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(600) as any }]}>
                Data Sharing Consent
              </Text>
              <TouchableOpacity onPress={handleConsentNo} style={styles.modalCloseButton}>
                <MaterialIcons name="close" size={getScaledFontSize(24)} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={true}>
              <View style={styles.consentSection}>
                <Text style={[styles.consentQuestion, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(600) as any }]}>
                  Do you consent to share your health-related data with {pendingEmail}?
                </Text>

                <Text style={[styles.consentDescription, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any }]}>
                  By selecting &quot;Yes&quot;, you agree to share your health information with this proxy to allow them to view and manage your medical records on your behalf.
                </Text>

                {pendingScopes.length > 0 && (
                  <View style={styles.consentScopeSection}>
                    <Text style={[styles.inputLabel, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any, marginBottom: 8 }]}>
                      Granted permissions:
                    </Text>
                    {pendingScopes.map(scope => (
                      <View key={scope} style={styles.consentScopeRow}>
                        <MaterialIcons name="check-circle" size={getScaledFontSize(16)} color={colors.tint} />
                        <Text style={[{ color: colors.text, fontSize: getScaledFontSize(14), marginLeft: 8 }]}>
                          {SCOPE_LABELS[scope]}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.termsSection}>
                <Text style={[styles.termsTitle, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}>
                  Terms and Conditions:
                </Text>

                <View style={styles.termsList}>
                  {[
                    'Your health data will be shared with the proxy for the purpose of managing your medical records.',
                    'The proxy is required to maintain confidentiality and comply with HIPAA regulations.',
                    'You have the right to revoke this consent at any time by removing the proxy.',
                    'Your data will be shared securely and only with authorized personnel.',
                    'The proxy will not sell or share your data with third parties without your explicit consent.',
                  ].map((term, i) => (
                    <View key={i} style={styles.termItem}>
                      <MaterialIcons name="check-circle" size={getScaledFontSize(16)} color={colors.tint} />
                      <Text style={[styles.termText, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any }]}>
                        {term}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <Button
                mode="outlined"
                onPress={handleConsentNo}
                style={[styles.modalButton, { borderColor: colors.text + '40' }]}
                labelStyle={{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any, color: colors.text }}
              >
                No
              </Button>
              <Button
                mode="contained"
                onPress={handleConsentYes}
                loading={createProxy.isPending}
                disabled={createProxy.isPending}
                style={[styles.modalButton, { backgroundColor: colors.tint }]}
                labelStyle={{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any, color: '#fff' }}
              >
                Yes, I Consent
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Scopes Modal */}
      <Modal
        visible={showEditScopesModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowEditScopesModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.addModalContent, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(600) as any }]}>
                Edit Permissions
              </Text>
              <TouchableOpacity onPress={() => setShowEditScopesModal(false)} style={styles.modalCloseButton}>
                <MaterialIcons name="close" size={getScaledFontSize(24)} color={colors.text} />
              </TouchableOpacity>
            </View>

            {editingProxy && (
              <Text style={[{ color: colors.text + '80', fontSize: getScaledFontSize(14), paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 }]}>
                {editingProxy.email}
              </Text>
            )}

            <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator>
              <View style={styles.addModalBody}>
                {renderScopeToggles(selectedScopes, setSelectedScopes)}
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <Button
                mode="outlined"
                onPress={() => setShowEditScopesModal(false)}
                style={[styles.modalButton, { borderColor: colors.text + '40' }]}
                labelStyle={{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any, color: colors.text }}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={handleSaveEditScopes}
                loading={updateProxy.isPending}
                disabled={updateProxy.isPending}
                style={[styles.modalButton, { backgroundColor: colors.tint }]}
                labelStyle={{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any, color: '#fff' }}
              >
                Save
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  infoCard: {
    marginBottom: 16,
    borderRadius: 12,
  },
  infoText: {
    lineHeight: 20,
  },
  addButton: {
    borderRadius: 12,
    paddingVertical: 4,
    marginBottom: 24,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  loadingText: {
    marginTop: 0,
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
  emptyCard: {
    borderRadius: 12,
    marginBottom: 16,
  },
  emptyContent: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    textAlign: 'center',
  },
  proxiesList: {
    gap: 12,
  },
  proxyCard: {
    borderRadius: 12,
    marginBottom: 0,
  },
  proxyContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  proxyInfo: {
    flex: 1,
  },
  proxyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  proxyEmail: {
    flex: 1,
  },
  proxyStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    textTransform: 'capitalize',
  },
  consentDate: {
    marginTop: 0,
  },
  scopeSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  scopeChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  scopeChipText: {
    fontWeight: '500',
  },
  proxyActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  editButton: {
    padding: 8,
  },
  removeButton: {
    padding: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  addModalContent: {
    width: '100%',
    maxWidth: 500,
    borderRadius: 20,
    paddingBottom: 0,
    maxHeight: '85%',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalContent: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '85%',
    borderRadius: 16,
    padding: 0,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    alignSelf: 'center',
    margin: 20,
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
  addModalBody: {
    padding: 20,
  },
  inputLabel: {
    marginBottom: 8,
  },
  emailInput: {
    backgroundColor: 'transparent',
    marginBottom: 8,
  },
  modalScrollView: {
    maxHeight: 420,
  },
  consentSection: {
    marginBottom: 24,
    padding: 20,
  },
  consentQuestion: {
    marginBottom: 12,
  },
  consentDescription: {
    lineHeight: 20,
  },
  consentScopeSection: {
    marginTop: 16,
  },
  consentScopeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  termsSection: {
    marginTop: 8,
    padding: 20,
    paddingTop: 0,
  },
  termsTitle: {
    marginBottom: 16,
  },
  termsList: {
    gap: 12,
  },
  termItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  termText: {
    flex: 1,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    borderRadius: 12,
  },
  scopesList: {
    gap: 4,
  },
  scopeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  scopeLabel: {
    flex: 1,
    marginRight: 12,
  },
});
