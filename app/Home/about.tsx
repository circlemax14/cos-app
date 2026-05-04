import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Share,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

/**
 * About screen — exposes the build / runtime / OTA fingerprint of the
 * currently running JS bundle. Mainly for support: when something looks
 * wrong on a user's device we can ask them to open About and read off
 * the Update ID, build number, and runtime version. Also lets the user
 * (or us, when remoting in via TestFlight) manually trigger an update
 * check + apply, instead of relying on the cold-launch auto-check.
 */
export default function AboutScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? 'unknown';
  const buildNumber =
    Platform.OS === 'ios'
      ? Constants.expoConfig?.ios?.buildNumber ?? 'unknown'
      : String(Constants.expoConfig?.android?.versionCode ?? 'unknown');
  const runtimeVersion = Updates.runtimeVersion ?? 'unknown';
  const channel = Updates.channel ?? 'unknown';
  const updateId = Updates.isEmbeddedLaunch ? 'embedded (no OTA applied)' : Updates.updateId ?? 'unknown';
  const platform = Platform.OS;

  const handleCheck = async () => {
    if (checking || downloading) return;
    setChecking(true);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        Alert.alert('Up to date', 'You already have the latest version.');
        return;
      }
      // Update is available — offer to download and apply.
      Alert.alert(
        'Update available',
        'A new version is available. Download and restart now?',
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Download & Restart',
            onPress: async () => {
              setDownloading(true);
              try {
                await Updates.fetchUpdateAsync();
                await Updates.reloadAsync();
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                Alert.alert('Update failed', `Could not download the update.\n\n${msg}`);
              } finally {
                setDownloading(false);
              }
            },
          },
        ],
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Check failed', `Could not check for updates.\n\n${msg}`);
    } finally {
      setChecking(false);
    }
  };

  const handleShare = async () => {
    const body = [
      `App: Circle Support Health`,
      `Version: ${appVersion} (${buildNumber})`,
      `Runtime: ${runtimeVersion}`,
      `Channel: ${channel}`,
      `Update ID: ${updateId}`,
      `Platform: ${platform}`,
    ].join('\n');
    try {
      await Share.share({ message: body });
    } catch {
      // ignore
    }
  };

  const Row = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <Text
        style={{
          color: colors.subtext,
          fontSize: getScaledFontSize(13),
          fontWeight: getScaledFontWeight(500) as '500',
        }}
      >
        {label}
      </Text>
      <Text
        selectable
        style={{
          color: colors.text,
          fontSize: getScaledFontSize(13),
          fontWeight: getScaledFontWeight(600) as '600',
          fontFamily: mono && Platform.OS === 'ios' ? 'Menlo' : mono ? 'monospace' : undefined,
          flexShrink: 1,
          textAlign: 'right',
          maxWidth: '60%',
        }}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );

  return (
    <AppWrapper>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Back">
            <MaterialIcons name="arrow-back" size={getScaledFontSize(24)} color={colors.text} />
          </Pressable>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(20),
              fontWeight: getScaledFontWeight(700) as 'bold',
              flex: 1,
            }}
          >
            About
          </Text>
        </View>

        {/* Build details card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(11),
              fontWeight: getScaledFontWeight(700) as 'bold',
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              marginBottom: 12,
            }}
          >
            Build
          </Text>
          <Row label="Version" value={`${appVersion} (${buildNumber})`} />
          <Row label="Runtime" value={runtimeVersion} />
          <Row label="Channel" value={channel} />
          <Row label="Platform" value={platform} />
        </View>

        {/* Update details card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(11),
              fontWeight: getScaledFontWeight(700) as 'bold',
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              marginBottom: 12,
            }}
          >
            Update
          </Text>
          <Row label="Update ID" value={updateId} mono />
        </View>

        {/* Actions */}
        <Pressable
          onPress={handleCheck}
          disabled={checking || downloading}
          style={({ pressed }) => [
            styles.primaryBtn,
            {
              backgroundColor: colors.primary,
              opacity: pressed || checking || downloading ? 0.7 : 1,
            },
          ]}
        >
          {checking || downloading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(700) as 'bold' }}>
              Check for updates
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={handleShare}
          style={({ pressed }) => [
            styles.secondaryBtn,
            {
              borderColor: colors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <MaterialIcons name="share" size={getScaledFontSize(18)} color={colors.text} />
          <Text style={{ color: colors.text, fontSize: getScaledFontSize(15), fontWeight: getScaledFontWeight(600) as '600' }}>
            Share build details
          </Text>
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  primaryBtn: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  secondaryBtn: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },
});
