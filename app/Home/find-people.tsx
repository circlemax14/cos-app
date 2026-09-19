/**
 * COS-1058 — find someone to message.
 *
 * Vishal, 2026-09-19: "a list will appear like their profile picture and name,
 * so someone can send them a request."
 *
 * ─── WHAT THIS SCREEN DELIBERATELY DOES NOT SHOW ─────────────────────
 *
 * Name and photo. Not whether someone is a patient or a provider, not their
 * email, not anything clinical — the server does not even fetch those fields,
 * so there is nothing here to leak by adding a line of JSX.
 *
 * ─── AND WHAT IT SAYS ABOUT BEING FOUND ──────────────────────────────
 *
 * Only people who turned discoverability ON appear. The screen says so, and
 * offers the toggle, because a search box that silently returns nobody looks
 * broken — and because the honest explanation ("people choose to be listed")
 * is also the reason this feature is safe to have at all.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, TextInput, Image, Switch } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppWrapper } from '@/components/app-wrapper';
import {
  searchDirectory,
  requestConnection,
  fetchDiscoverability,
  setDiscoverability,
  type DirectoryEntry,
} from '@/services/api/conversations';
import { Colors } from '@/constants/theme';
import { Spacing, Radii } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';

/*
 * COS-1058 — required on every leaf route, and enforced by a test.
 *
 * Without it a throw in this screen takes the WHOLE app down rather than one
 * tab. That guard caught all four of these screens on their first run, which
 * is exactly what it is for.
 */
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

/** Matches MIN_QUERY_LENGTH on the server. Below this we do not even ask. */
const MIN_QUERY = 2;

export default function FindPeopleScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [requested, setRequested] = useState<Record<string, boolean>>({});

  const trimmed = query.trim();
  const resultsQ = useQuery({
    queryKey: ['directory-search', trimmed],
    queryFn: () => searchDirectory(trimmed),
    // Below the minimum we do not call at all, rather than calling and
    // handling a 400 — an error that flashes on the first keystroke of every
    // search trains people to ignore errors.
    enabled: trimmed.length >= MIN_QUERY,
    staleTime: 15_000,
  });

  const discoverableQ = useQuery({
    queryKey: ['discoverability'],
    queryFn: fetchDiscoverability,
    staleTime: 60_000,
  });

  const toggleDiscoverable = useMutation({
    mutationFn: (next: boolean) => setDiscoverability(next),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['discoverability'] }),
  });

  const connect = useMutation({
    mutationFn: (userId: string) => requestConnection(userId),
    onSuccess: (_d, userId) => setRequested((r) => ({ ...r, [userId]: true })),
  });

  const renderItem = ({ item }: { item: DirectoryEntry }) => (
    <View style={[styles.row, { borderColor: colors.border }]}>
      {item.photoUrl ? (
        <Image source={{ uri: item.photoUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, { backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' }]}>
          <MaterialIcons name="person" size={getScaledFontSize(20)} color={colors.icon} />
        </View>
      )}
      <Text
        style={{
          flex: 1,
          marginLeft: Spacing.sm,
          color: colors.text,
          fontSize: getScaledFontSize(15),
        }}
        numberOfLines={1}
      >
        {item.displayName || 'Unnamed'}
      </Text>
      {/* No role badge. See the header. */}
      <Pressable
        onPress={() => connect.mutate(item.userId)}
        disabled={requested[item.userId] === true || connect.isPending}
        accessibilityRole="button"
        accessibilityLabel={`Send a request to ${item.displayName}`}
        style={[styles.connectBtn, { borderColor: colors.border, opacity: requested[item.userId] ? 0.5 : 1 }]}
      >
        <Text style={{ color: colors.tint, fontSize: getScaledFontSize(13), fontWeight: '600' }}>
          {requested[item.userId] ? 'Requested' : 'Connect'}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <AppWrapper>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10}>
          <MaterialIcons name="arrow-back" size={getScaledFontSize(22)} color={colors.text} />
        </Pressable>
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(16),
            fontWeight: getScaledFontWeight(600) as never,
            marginLeft: Spacing.sm,
          }}
          accessibilityRole="header"
        >
          Find people
        </Text>
      </View>

      <View style={{ padding: Spacing.md, gap: Spacing.sm }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name"
          placeholderTextColor={colors.subtext as string}
          autoCapitalize="none"
          accessibilityLabel="Search people by name"
          style={[styles.search, { borderColor: colors.border, color: colors.text }]}
        />

        <View style={[styles.optIn, { borderColor: colors.border }]}>
          <View style={{ flex: 1, paddingRight: Spacing.sm }}>
            <Text style={{ color: colors.text, fontSize: getScaledFontSize(14), fontWeight: '600' }}>
              Let others find me
            </Text>
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(12), marginTop: 2 }}>
              You only appear in search if you turn this on. You can turn it off at any time.
            </Text>
          </View>
          <Switch
            value={discoverableQ.data === true}
            onValueChange={(v) => toggleDiscoverable.mutate(v)}
            disabled={discoverableQ.isLoading || toggleDiscoverable.isPending}
            accessibilityLabel="Let others find me in search"
          />
        </View>
      </View>

      <FlatList
        data={resultsQ.data ?? []}
        keyExtractor={(u) => u.userId}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: Spacing.md, gap: Spacing.sm, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), textAlign: 'center' }}>
              {trimmed.length < MIN_QUERY
                ? `Type at least ${MIN_QUERY} letters to search.`
                : resultsQ.isLoading
                  ? 'Searching…'
                  : 'Nobody found. Only people who chose to be listed appear here.'}
            </Text>
          </View>
        }
      />
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  search: { borderWidth: 1, borderRadius: Radii.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  optIn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Radii.md, padding: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Radii.md, padding: Spacing.sm },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  connectBtn: { borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 12, paddingVertical: 6 },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
});
