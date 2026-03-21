import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Card, Icon, Button } from 'react-native-paper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useHealthDetails, useUpdateHealthDetails } from '@/hooks/use-health-details';
import { AppWrapper } from '@/components/app-wrapper';

export default function HealthDetailsScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const { data: healthDetails, isLoading, isError, refetch } = useHealthDetails();
  const updateMutation = useUpdateHealthDetails();

  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState({
    height: '',
    weight: '',
    bloodType: '',
    bloodPressureSystolic: '',
    bloodPressureDiastolic: '',
    usesCpap: false,
    chronicConditions: [] as string[],
    allergies: [] as string[],
    notes: '',
  });

  const [newCondition, setNewCondition] = useState('');
  const [newAllergy, setNewAllergy] = useState('');

  React.useEffect(() => {
    if (healthDetails) {
      setEditedData({
        height: healthDetails.height || '',
        weight: healthDetails.weight || '',
        bloodType: healthDetails.bloodType || '',
        bloodPressureSystolic: '',
        bloodPressureDiastolic: '',
        usesCpap: healthDetails.usesCpap || false,
        chronicConditions: healthDetails.chronicConditions || [],
        allergies: healthDetails.allergies || [],
        notes: healthDetails.notes || '',
      });
    }
  }, [healthDetails]);

  const handleSave = () => {
    const dataToSave = {
      height: editedData.height.trim() || undefined,
      weight: editedData.weight.trim() || undefined,
      bloodType: editedData.bloodType.trim() || undefined,
      usesCpap: editedData.usesCpap,
      chronicConditions: editedData.chronicConditions,
      allergies: editedData.allergies,
      notes: editedData.notes.trim() || undefined,
    };

    updateMutation.mutate(dataToSave, {
      onSuccess: () => {
        setIsEditing(false);
      },
      onError: () => {
        alert('Failed to save health details. Please try again.');
      },
    });
  };

  const handleCancel = () => {
    if (healthDetails) {
      setEditedData({
        height: healthDetails.height || '',
        weight: healthDetails.weight || '',
        bloodType: healthDetails.bloodType || '',
        bloodPressureSystolic: '',
        bloodPressureDiastolic: '',
        usesCpap: healthDetails.usesCpap || false,
        chronicConditions: healthDetails.chronicConditions || [],
        allergies: healthDetails.allergies || [],
        notes: healthDetails.notes || '',
      });
    }
    setIsEditing(false);
  };

  const addCondition = () => {
    if (newCondition.trim()) {
      setEditedData({
        ...editedData,
        chronicConditions: [...editedData.chronicConditions, newCondition.trim()],
      });
      setNewCondition('');
    }
  };

  const removeCondition = (index: number) => {
    setEditedData({
      ...editedData,
      chronicConditions: editedData.chronicConditions.filter((_, i) => i !== index),
    });
  };

  const addAllergy = () => {
    if (newAllergy.trim()) {
      setEditedData({
        ...editedData,
        allergies: [...editedData.allergies, newAllergy.trim()],
      });
      setNewAllergy('');
    }
  };

  const removeAllergy = (index: number) => {
    setEditedData({
      ...editedData,
      allergies: editedData.allergies.filter((_, i) => i !== index),
    });
  };

  if (isLoading) {
    return (
      <AppWrapper>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text
            style={[
              styles.loadingText,
              {
                color: colors.text,
                fontSize: getScaledFontSize(16),
                fontWeight: getScaledFontWeight(400) as any,
              },
            ]}
          >
            Loading health details...
          </Text>
        </View>
      </AppWrapper>
    );
  }

  if (isError) {
    return (
      <AppWrapper>
        <View style={styles.loadingContainer}>
          <Text
            style={[
              styles.loadingText,
              {
                color: colors.text,
                fontSize: getScaledFontSize(16),
                fontWeight: getScaledFontWeight(400) as any,
              },
            ]}
          >
            Failed to load health details.
          </Text>
          <TouchableOpacity onPress={() => refetch()} style={[styles.retryButton, { borderColor: colors.tint }]}>
            <Text style={[styles.retryText, { color: colors.tint, fontSize: getScaledFontSize(16) }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      </AppWrapper>
    );
  }

  return (
    <AppWrapper>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Title Section */}
        <View style={styles.titleSection}>
          <Text
            style={[
              styles.title,
              { color: colors.text, fontSize: getScaledFontSize(24), fontWeight: getScaledFontWeight(600) as any },
            ]}
          >
            Health Details
          </Text>
          {!isEditing && (
            <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.editButton}>
              <Icon source="pencil" size={getScaledFontSize(24)} color={colors.tint} />
            </TouchableOpacity>
          )}
        </View>

        {/* Height */}
        <Card style={[styles.card, { backgroundColor: colors.cardBackground }]}>
          <Card.Content>
            <Text
              style={[
                styles.label,
                { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any },
              ]}
            >
              Height
            </Text>
            {isEditing ? (
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, fontSize: getScaledFontSize(16) }]}
                value={editedData.height}
                onChangeText={(text) => setEditedData({ ...editedData, height: text })}
                placeholder="e.g., 182 cm"
                placeholderTextColor={colors.text + '60'}
              />
            ) : (
              <Text
                style={[
                  styles.value,
                  { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(400) as any },
                ]}
              >
                {healthDetails?.height || 'Not set'}
              </Text>
            )}
          </Card.Content>
        </Card>

        {/* Weight */}
        <Card style={[styles.card, { backgroundColor: colors.cardBackground }]}>
          <Card.Content>
            <Text
              style={[
                styles.label,
                { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any },
              ]}
            >
              Weight
            </Text>
            {isEditing ? (
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, fontSize: getScaledFontSize(16) }]}
                value={editedData.weight}
                onChangeText={(text) => setEditedData({ ...editedData, weight: text })}
                placeholder="e.g., 111.1 kg"
                placeholderTextColor={colors.text + '60'}
              />
            ) : (
              <Text
                style={[
                  styles.value,
                  { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(400) as any },
                ]}
              >
                {healthDetails?.weight || 'Not set'}
              </Text>
            )}
          </Card.Content>
        </Card>

        {/* Blood Type */}
        <Card style={[styles.card, { backgroundColor: colors.cardBackground }]}>
          <Card.Content>
            <Text
              style={[
                styles.label,
                { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any },
              ]}
            >
              Blood Type
            </Text>
            {isEditing ? (
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, fontSize: getScaledFontSize(16) }]}
                value={editedData.bloodType}
                onChangeText={(text) => setEditedData({ ...editedData, bloodType: text })}
                placeholder="e.g., O+, A-, B+"
                placeholderTextColor={colors.text + '60'}
              />
            ) : (
              <Text
                style={[
                  styles.value,
                  { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(400) as any },
                ]}
              >
                {healthDetails?.bloodType || 'Not set'}
              </Text>
            )}
          </Card.Content>
        </Card>

        {/* Uses CPAP */}
        <Card style={[styles.card, { backgroundColor: colors.cardBackground }]}>
          <Card.Content>
            <View style={styles.switchContainer}>
              <View style={styles.switchLabelContainer}>
                <Text
                  style={[
                    styles.label,
                    { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any },
                  ]}
                >
                  Uses CPAP
                </Text>
                <Text
                  style={[
                    styles.switchDescription,
                    {
                      color: colors.text + '80',
                      fontSize: getScaledFontSize(12),
                      fontWeight: getScaledFontWeight(400) as any,
                    },
                  ]}
                >
                  Continuous Positive Airway Pressure device
                </Text>
              </View>
              <Switch
                value={isEditing ? editedData.usesCpap : (healthDetails?.usesCpap || false)}
                onValueChange={(value) => setEditedData({ ...editedData, usesCpap: value })}
                disabled={!isEditing}
                trackColor={{ false: colors.border, true: colors.tint + '40' }}
                thumbColor={isEditing && editedData.usesCpap ? colors.tint : colors.text + '40'}
              />
            </View>
          </Card.Content>
        </Card>

        {/* Chronic Conditions */}
        <Card style={[styles.card, { backgroundColor: colors.cardBackground }]}>
          <Card.Content>
            <Text
              style={[
                styles.label,
                { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any },
              ]}
            >
              Chronic Medical Conditions
            </Text>
            {isEditing ? (
              <View style={styles.conditionsContainer}>
                <View style={styles.addConditionContainer}>
                  <TextInput
                    style={[
                      styles.conditionInput,
                      { color: colors.text, borderColor: colors.border, fontSize: getScaledFontSize(14) },
                    ]}
                    value={newCondition}
                    onChangeText={setNewCondition}
                    placeholder="Add condition (e.g., Diabetes, Asthma)"
                    placeholderTextColor={colors.text + '60'}
                    onSubmitEditing={addCondition}
                  />
                  <TouchableOpacity onPress={addCondition} style={[styles.addButton, { backgroundColor: colors.tint }]}>
                    <Icon source="plus" size={getScaledFontSize(20)} color="#fff" />
                  </TouchableOpacity>
                </View>
                {editedData.chronicConditions.map((condition, index) => (
                  <View key={index} style={[styles.conditionTag, { backgroundColor: colors.tint + '20' }]}>
                    <Text
                      style={[
                        styles.conditionText,
                        {
                          color: colors.text,
                          fontSize: getScaledFontSize(14),
                          fontWeight: getScaledFontWeight(400) as any,
                        },
                      ]}
                    >
                      {condition}
                    </Text>
                    <TouchableOpacity onPress={() => removeCondition(index)}>
                      <Icon source="close" size={getScaledFontSize(18)} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.conditionsList}>
                {healthDetails?.chronicConditions && healthDetails.chronicConditions.length > 0 ? (
                  healthDetails.chronicConditions.map((condition, index) => (
                    <View key={index} style={[styles.conditionTag, { backgroundColor: colors.tint + '20' }]}>
                      <Text
                        style={[
                          styles.conditionText,
                          {
                            color: colors.text,
                            fontSize: getScaledFontSize(14),
                            fontWeight: getScaledFontWeight(400) as any,
                          },
                        ]}
                      >
                        {condition}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text
                    style={[
                      styles.emptyText,
                      {
                        color: colors.text + '60',
                        fontSize: getScaledFontSize(14),
                        fontWeight: getScaledFontWeight(400) as any,
                      },
                    ]}
                  >
                    No chronic conditions recorded
                  </Text>
                )}
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Allergies */}
        <Card style={[styles.card, { backgroundColor: colors.cardBackground }]}>
          <Card.Content>
            <Text
              style={[
                styles.label,
                { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any },
              ]}
            >
              Allergies
            </Text>
            {isEditing ? (
              <View style={styles.conditionsContainer}>
                <View style={styles.addConditionContainer}>
                  <TextInput
                    style={[
                      styles.conditionInput,
                      { color: colors.text, borderColor: colors.border, fontSize: getScaledFontSize(14) },
                    ]}
                    value={newAllergy}
                    onChangeText={setNewAllergy}
                    placeholder="Add allergy (e.g., Penicillin, Peanuts)"
                    placeholderTextColor={colors.text + '60'}
                    onSubmitEditing={addAllergy}
                  />
                  <TouchableOpacity onPress={addAllergy} style={[styles.addButton, { backgroundColor: colors.tint }]}>
                    <Icon source="plus" size={getScaledFontSize(20)} color="#fff" />
                  </TouchableOpacity>
                </View>
                {editedData.allergies.map((allergy, index) => (
                  <View key={index} style={[styles.conditionTag, { backgroundColor: '#ff9800' + '20' }]}>
                    <Text
                      style={[
                        styles.conditionText,
                        {
                          color: colors.text,
                          fontSize: getScaledFontSize(14),
                          fontWeight: getScaledFontWeight(400) as any,
                        },
                      ]}
                    >
                      {allergy}
                    </Text>
                    <TouchableOpacity onPress={() => removeAllergy(index)}>
                      <Icon source="close" size={getScaledFontSize(18)} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.conditionsList}>
                {healthDetails?.allergies && healthDetails.allergies.length > 0 ? (
                  healthDetails.allergies.map((allergy, index) => (
                    <View key={index} style={[styles.conditionTag, { backgroundColor: '#ff9800' + '20' }]}>
                      <Text
                        style={[
                          styles.conditionText,
                          {
                            color: colors.text,
                            fontSize: getScaledFontSize(14),
                            fontWeight: getScaledFontWeight(400) as any,
                          },
                        ]}
                      >
                        {allergy}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text
                    style={[
                      styles.emptyText,
                      {
                        color: colors.text + '60',
                        fontSize: getScaledFontSize(14),
                        fontWeight: getScaledFontWeight(400) as any,
                      },
                    ]}
                  >
                    No allergies recorded
                  </Text>
                )}
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Notes */}
        <Card style={[styles.card, { backgroundColor: colors.cardBackground }]}>
          <Card.Content>
            <Text
              style={[
                styles.label,
                { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(500) as any },
              ]}
            >
              Notes
            </Text>
            {isEditing ? (
              <TextInput
                style={[
                  styles.notesInput,
                  { color: colors.text, borderColor: colors.border, fontSize: getScaledFontSize(14) },
                ]}
                value={editedData.notes}
                onChangeText={(text) => setEditedData({ ...editedData, notes: text })}
                placeholder="Additional health notes..."
                placeholderTextColor={colors.text + '60'}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            ) : (
              <Text
                style={[
                  styles.value,
                  { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(400) as any },
                ]}
              >
                {healthDetails?.notes || 'No notes'}
              </Text>
            )}
          </Card.Content>
        </Card>

        {isEditing && (
          <View style={styles.actionButtons}>
            <Button
              mode="outlined"
              onPress={handleCancel}
              style={[styles.cancelButton, { borderColor: colors.border }]}
              labelStyle={{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any }}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleSave}
              disabled={updateMutation.isPending}
              loading={updateMutation.isPending}
              style={[styles.saveButton, { backgroundColor: colors.tint }]}
              labelStyle={{ fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(500) as any, color: '#fff' }}
            >
              {updateMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </View>
        )}
      </ScrollView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    textAlign: 'center',
    marginTop: 12,
  },
  retryButton: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 24,
  },
  retryText: {
    fontWeight: '500',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  titleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  title: {
    flex: 1,
  },
  editButton: {
    padding: 8,
  },
  card: {
    marginBottom: 16,
    borderRadius: 12,
  },
  label: {
    marginBottom: 8,
  },
  value: {
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    minHeight: 100,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchLabelContainer: {
    flex: 1,
    marginRight: 16,
  },
  switchDescription: {
    marginTop: 4,
  },
  conditionsContainer: {
    marginTop: 8,
  },
  addConditionContainer: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  conditionInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginRight: 8,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  conditionsList: {
    marginTop: 8,
  },
  conditionTag: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  conditionText: {
    flex: 1,
  },
  emptyText: {
    marginTop: 8,
    fontStyle: 'italic',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 32,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
  },
  saveButton: {
    flex: 1,
  },
});
