import React, { useCallback, useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, List, Text } from 'react-native-paper';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';

import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import {
  getLinkedProviders,
  linkProvider,
  signInWithApple,
} from '@/services/social-auth';

WebBrowser.maybeCompleteAuthSession();

export default function LinkedAccountsScreen() {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const [googleLinked, setGoogleLinked] = useState(false);
  const [appleLinked, setAppleLinked] = useState(false);
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);
  const [googleLinking, setGoogleLinking] = useState(false);
  const [appleLinking, setAppleLinking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Google auth request for linking
  const [, googleResponse, promptGoogleAsync] = Google.useIdTokenAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });

  const loadProviders = useCallback(async () => {
    setIsLoadingProviders(true);
    try {
      const providers = await getLinkedProviders();
      setGoogleLinked(providers.google);
      setAppleLinked(providers.apple);
    } catch {
      // Keep default (false) — not a blocking error
    } finally {
      setIsLoadingProviders(false);
    }
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  // Handle Google auth response for linking
  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const { id_token } = googleResponse.params;
      handleLinkGoogleToken(id_token);
    } else if (googleResponse?.type === 'error' || googleResponse?.type === 'dismiss') {
      setGoogleLinking(false);
      if (googleResponse?.type === 'error') {
        setStatusMessage({ text: 'Google connection failed. Please try again.', isError: true });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleResponse]);

  const handleLinkGoogleToken = async (idToken: string) => {
    setGoogleLinking(true);
    setStatusMessage(null);
    try {
      await linkProvider('google', idToken);
      setGoogleLinked(true);
      setStatusMessage({ text: 'Google account connected successfully.', isError: false });
    } catch {
      setStatusMessage({ text: 'Failed to connect Google account. Please try again.', isError: true });
    } finally {
      setGoogleLinking(false);
    }
  };

  const handleConnectGoogle = async () => {
    setGoogleLinking(true);
    setStatusMessage(null);
    await promptGoogleAsync();
    // Result handled in the googleResponse useEffect above
  };

  const handleConnectApple = async () => {
    try {
      setAppleLinking(true);
      setStatusMessage(null);
      const { identityToken } = await signInWithApple();
      await linkProvider('apple', identityToken);
      setAppleLinked(true);
      setStatusMessage({ text: 'Apple account connected successfully.', isError: false });
    } catch (err: unknown) {
      const appleErr = err as { code?: string };
      if (appleErr.code !== 'ERR_REQUEST_CANCELED') {
        setStatusMessage({ text: 'Failed to connect Apple account. Please try again.', isError: true });
      }
    } finally {
      setAppleLinking(false);
    }
  };

  const textStyle = {
    color: colors.text,
    fontSize: getScaledFontSize(16),
    fontWeight: getScaledFontWeight(600) as any,
  };

  return (
    <AppWrapper>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.headerSection}>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(22),
              fontWeight: getScaledFontWeight(700) as any,
              textAlign: 'center',
              marginBottom: 4,
            }}
            accessibilityRole="header"
          >
            Linked Accounts
          </Text>
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(14),
              textAlign: 'center',
            }}
          >
            Connect social accounts to sign in faster
          </Text>
        </View>

        {/* Status message */}
        {statusMessage ? (
          <Text
            style={[
              styles.statusMessage,
              {
                color: statusMessage.isError ? '#DC2626' : '#059669',
                fontSize: getScaledFontSize(14),
              },
            ]}
            accessibilityRole="alert"
          >
            {statusMessage.text}
          </Text>
        ) : null}

        {/* Providers list */}
        <View style={styles.section}>
          <Text
            style={{
              color: colors.subtext,
              fontSize: getScaledFontSize(13),
              fontWeight: getScaledFontWeight(600) as any,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 12,
              marginLeft: 4,
            }}
          >
            Connected Providers
          </Text>

          {/* Google row */}
          <Card style={[styles.card, { backgroundColor: colors.card }]}>
            <List.Item
              title={<Text style={textStyle}>Google</Text>}
              description={
                <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13) }}>
                  {isLoadingProviders
                    ? 'Loading...'
                    : googleLinked
                    ? 'Connected'
                    : 'Not connected'}
                </Text>
              }
              left={() => (
                <View style={styles.iconWrapper}>
                  <Text style={styles.providerEmoji}>G</Text>
                </View>
              )}
              right={() =>
                !isLoadingProviders && !googleLinked ? (
                  <Button
                    mode="outlined"
                    compact
                    loading={googleLinking}
                    disabled={googleLinking}
                    onPress={handleConnectGoogle}
                    style={styles.connectButton}
                    labelStyle={{ fontSize: getScaledFontSize(13) }}
                    accessibilityLabel="Connect Google account"
                  >
                    Connect
                  </Button>
                ) : (
                  <Text style={{ color: '#059669', fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(600) as any, alignSelf: 'center', marginRight: 8 }}>
                    {isLoadingProviders ? '' : 'Connected'}
                  </Text>
                )
              }
            />
          </Card>

          {/* Apple row — iOS only */}
          {Platform.OS === 'ios' && (
            <Card style={[styles.card, { backgroundColor: colors.card }]}>
              <List.Item
                title={<Text style={textStyle}>Apple</Text>}
                description={
                  <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13) }}>
                    {isLoadingProviders
                      ? 'Loading...'
                      : appleLinked
                      ? 'Connected'
                      : 'Not connected'}
                  </Text>
                }
                left={() => (
                  <View style={styles.iconWrapper}>
                    <Text style={[styles.providerEmoji, { color: settings.isDarkTheme ? '#fff' : '#000' }]}>
                      {'\uf8ff'}
                    </Text>
                  </View>
                )}
                right={() =>
                  !isLoadingProviders && !appleLinked ? (
                    <Button
                      mode="outlined"
                      compact
                      loading={appleLinking}
                      disabled={appleLinking}
                      onPress={handleConnectApple}
                      style={styles.connectButton}
                      labelStyle={{ fontSize: getScaledFontSize(13) }}
                      accessibilityLabel="Connect Apple account"
                    >
                      Connect
                    </Button>
                  ) : (
                    <Text style={{ color: '#059669', fontSize: getScaledFontSize(13), fontWeight: getScaledFontWeight(600) as any, alignSelf: 'center', marginRight: 8 }}>
                      {isLoadingProviders ? '' : 'Connected'}
                    </Text>
                  )
                }
              />
            </Card>
          )}
        </View>

        <View style={styles.note}>
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13), textAlign: 'center' }}>
            Linking an account lets you sign in using that provider in the future.
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  statusMessage: {
    textAlign: 'center',
    marginBottom: 16,
  },
  section: {
    marginBottom: 24,
  },
  card: {
    borderRadius: 14,
    marginBottom: 12,
    paddingLeft: 4,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginLeft: 8,
  },
  providerEmoji: {
    fontSize: 22,
    fontWeight: '700',
    color: '#4285F4',
  },
  connectButton: {
    alignSelf: 'center',
    marginRight: 8,
    borderRadius: 16,
  },
  note: {
    paddingHorizontal: 8,
  },
});
