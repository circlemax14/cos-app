/**
 * COS-1063 — the way into finding people, from the Social tab.
 *
 * ─── WHY IT IS HERE AND NOT ONLY ON INBOX ────────────────────────────
 *
 * Vishal went looking for the new people-search under the Supports modal's
 * Social tab and found it unchanged, because COS-1053/1058 hung it off Inbox
 * instead. Inbox is where your existing threads are; Social is where you go to
 * find a person. Both are reasonable places to look, so both now lead here —
 * one screen, two doors.
 *
 * ─── THE iOS 26 CONSTRAINT THIS IS SHAPED AROUND ─────────────────────
 *
 * `react-native-paper-tabs` <TabScreen> with more than ONE direct child
 * crashes the native snapshot on iOS 26. The Social tab's content is already a
 * <TabsProvider> (it has sub-tabs), so this cannot be rendered beside it.
 * It is nested inside a single flex:1 <View> together with that provider —
 * same children, same order, one extra parent.
 *
 * Primitives only: View / Text / Pressable / MaterialIcons / StyleSheet. No
 * Modal, no Animated, no react-native-svg. See ADR-0003.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

export function FindPeopleEntry({ pendingCount = 0 }: { pendingCount?: number }) {
  const router = useRouter();
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => router.push('/Home/find-people' as never)}
        accessibilityRole="button"
        accessibilityLabel="Find people"
        style={({ pressed }) => [
          styles.row,
          { borderColor: colors.border ?? '#E5E7EB', opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <MaterialIcons name="person-search" size={getScaledFontSize(22)} color={colors.primary} />
        <View style={styles.labels}>
          <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
            Find people
          </Text>
          <Text style={[styles.sub, { color: colors.subtext, fontSize: getScaledFontSize(11.5) }]}>
            Search for someone and send a connect request
          </Text>
        </View>
        <MaterialIcons name="chevron-right" size={getScaledFontSize(22)} color={colors.subtext} />
      </Pressable>

      <Pressable
        onPress={() => router.push('/Home/connection-requests' as never)}
        accessibilityRole="button"
        accessibilityLabel={
          pendingCount > 0 ? `Connection requests, ${String(pendingCount)} waiting` : 'Connection requests'
        }
        style={({ pressed }) => [
          styles.row,
          { borderColor: colors.border ?? '#E5E7EB', opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <MaterialIcons name="how-to-reg" size={getScaledFontSize(22)} color={colors.primary} />
        <View style={styles.labels}>
          <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
            Requests
          </Text>
          <Text style={[styles.sub, { color: colors.subtext, fontSize: getScaledFontSize(11.5) }]}>
            {pendingCount > 0
              ? `${String(pendingCount)} waiting on you`
              : 'People who asked to connect with you'}
          </Text>
        </View>
        {/*
          The count is rendered as text inside the row rather than as a badge
          on the tab itself. A badge on the Social tab would claim the whole
          tab is about requests, which it is not — most of it is the support
          list that was already here.
        */}
        {pendingCount > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
            <Text style={[styles.badgeText, { fontSize: getScaledFontSize(11) }]}>
              {pendingCount > 9 ? '9+' : String(pendingCount)}
            </Text>
          </View>
        )}
        <MaterialIcons name="chevron-right" size={getScaledFontSize(22)} color={colors.subtext} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderRadius: 12,
  },
  labels: { flex: 1, minWidth: 0 },
  title: { fontWeight: '600' },
  sub: { marginTop: 1 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { color: '#fff', fontWeight: '700' },
});

export default FindPeopleEntry;
