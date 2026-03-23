import { AppWrapper } from '@/components/app-wrapper';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { router } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Avatar, Card, Chip, Divider, Text } from 'react-native-paper';

export default function JennyScheduleScreen() {
  const { getScaledFontSize, settings, getScaledFontWeight } = useAccessibility();
  const userImg = require('@/assets/images/dummy.jpg');
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  // Get today's date
  const today = new Date();
  const todayFormatted = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });

  // Sample schedule data
  const scheduleItems = [
    {
      id: '1',
      time: '9:00 AM',
      title: 'Morning Medication',
      description: 'Take blood pressure medication with breakfast',
      icon: 'pills.fill',
      completed: true,
      category: 'Medication'
    },
    {
      id: '2',
      time: '10:00 AM',
      title: 'Therapy Session',
      description: 'Meeting with Dr. Sarah Johnson for weekly therapy',
      icon: 'person.2.fill',
      completed: false,
      category: 'Appointment',
      urgent: true
    },
    {
      id: '3',
      time: '2:00 PM',
      title: 'Exercise',
      description: '30-minute walk in the park',
      icon: 'figure.walk',
      completed: false,
      category: 'Wellness'
    },
    {
      id: '4',
      time: '3:30 PM',
      title: 'Afternoon Medication',
      description: 'Take vitamin supplements',
      icon: 'pills.fill',
      completed: false,
      category: 'Medication'
    },
    {
      id: '5',
      time: '5:00 PM',
      title: 'Call Family',
      description: 'Weekly check-in with Mom',
      icon: 'phone.fill',
      completed: false,
      category: 'Social'
    },
    {
      id: '6',
      time: '8:00 PM',
      title: 'Evening Medication',
      description: 'Take sleep medication before bed',
      icon: 'pills.fill',
      completed: false,
      category: 'Medication'
    },
  ];

  const completedCount = scheduleItems.filter(item => item.completed).length;
  const totalCount = scheduleItems.length;

  return (
    <AppWrapper notificationCount={3}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={getScaledFontSize(24)} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, {
          fontSize: getScaledFontSize(20),
          fontWeight: getScaledFontWeight(600) as any,
          color: colors.text
        }]}>Today&apos;s Schedule</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card */}
        <Card style={[styles.profileCard, { backgroundColor: colors.background }]}>
          <Card.Content>
            <View style={styles.profileHeader}>
              <Avatar.Image source={userImg} size={getScaledFontSize(64)} />
              <View style={styles.profileInfo}>
                <Text style={[styles.profileName, {
                  fontSize: getScaledFontSize(18),
                  fontWeight: getScaledFontWeight(600) as any,
                  color: colors.text
                }]}>Jenny Wilson</Text>
                <Text style={[styles.profileDate, {
                  fontSize: getScaledFontSize(14),
                  color: colors.icon
                }]}>{todayFormatted}</Text>
              </View>
            </View>
            <Divider style={styles.divider} />
            <View style={styles.progressContainer}>
              <View style={styles.progressInfo}>
                <Text style={[styles.progressText, {
                  fontSize: getScaledFontSize(14),
                  color: colors.text
                }]}>
                  Tasks Completed: {completedCount}/{totalCount}
                </Text>
                <View style={[styles.progressBar, { backgroundColor: colors.icon + '20' }]}>
                  <View style={[
                    styles.progressFill,
                    {
                      width: `${(completedCount / totalCount) * 100}%`,
                      backgroundColor: colors.tint
                    }
                  ]} />
                </View>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Schedule Items */}
        <View style={styles.scheduleContainer}>
          {scheduleItems.map((item, index) => (
            <Card
              key={item.id}
              style={[
                styles.scheduleCard,
                {
                  backgroundColor: colors.background,
                  opacity: item.completed ? 0.6 : 1
                }
              ]}
            >
              <Card.Content>
                <View style={styles.scheduleItem}>
                  <View style={styles.scheduleLeft}>
                    <View style={[styles.timeContainer, item.urgent && styles.urgentTimeContainer]}>
                      <Text style={[styles.timeText, {
                        fontSize: getScaledFontSize(14),
                        fontWeight: getScaledFontWeight(600) as any,
                        color: item.urgent ? '#fff' : colors.text
                      }]}>{item.time}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.scheduleContent}>
                    <View style={styles.scheduleHeader}>
                      <View style={styles.titleRow}>
                        <Text style={[styles.scheduleTitle, {
                          fontSize: getScaledFontSize(16),
                          fontWeight: getScaledFontWeight(600) as any,
                          color: colors.text,
                          textDecorationLine: item.completed ? 'line-through' : 'none'
                        }]}>{item.title}</Text>
                        {item.completed && (
                          <IconSymbol name="checkmark.circle.fill" size={getScaledFontSize(20)} color={colors.tint} />
                        )}
                      </View>
                      <Chip
                        icon={() => (
                          <IconSymbol
                            name={item.icon as any}
                            size={getScaledFontSize(14)}
                            color={colors.tint}
                          />
                        )}
                        style={styles.categoryChip}
                        textStyle={{ fontSize: getScaledFontSize(12) }}
                      >
                        {item.category}
                      </Chip>
                    </View>
                    <Text style={[styles.scheduleDescription, {
                      fontSize: getScaledFontSize(14),
                      color: colors.icon,
                      textDecorationLine: item.completed ? 'line-through' : 'none'
                    }]}>{item.description}</Text>
                  </View>
                </View>
              </Card.Content>
            </Card>
          ))}
        </View>
      </ScrollView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  profileCard: {
    marginBottom: 20,
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  profileInfo: {
    marginLeft: 16,
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  profileDate: {
    fontSize: 14,
    color: '#666',
  },
  divider: {
    marginVertical: 12,
  },
  progressContainer: {
    marginTop: 8,
  },
  progressInfo: {
    marginTop: 8,
  },
  progressText: {
    fontSize: 14,
    marginBottom: 8,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  scheduleContainer: {
    gap: 12,
  },
  scheduleCard: {
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  scheduleItem: {
    flexDirection: 'row',
  },
  scheduleLeft: {
    marginRight: 12,
  },
  timeContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    minWidth: 70,
    alignItems: 'center',
  },
  urgentTimeContainer: {
    backgroundColor: '#FF4444',
  },
  timeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  scheduleContent: {
    flex: 1,
  },
  scheduleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  scheduleTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  categoryChip: {
    height: 28,
    marginLeft: 8,
  },
  scheduleDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
});

