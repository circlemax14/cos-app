import React, { useCallback, useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, List, Text } from 'react-native-paper';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import {
  getLinkedProviders,
  linkProvider,
  signInWithApple,
} from '@/services/social-auth';
import { useCanRender } from '@/hooks/use-entitlement';

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

WebBrowser.maybeCompleteAuthSession();

export default function LinkedAccountsScreen() {
  const canViewLinkedAccounts = useCanRender('linked-accounts.view');
  const canLinkGoogleEntitlement = useCanRender('linked-accounts.link-google');
  /*
   * COS-928 — same three missing pieces as the sign-in screen (no Android
   * OAuth client, no intent-filter for the applicationId scheme, no Android
   * audience on the backend). Linking would open a browser and silently
   * return here having done nothing, and this screen's only feedback for a
   * dismissed flow is no feedback at all.
   *
   * Kept as a separate const from the entitlement so the two reasons a row can
   * be hidden stay legible: "your plan does not include it" and "this platform
   * cannot do it yet" are different answers.
   */
  const canLinkGoogle = canLinkGoogleEntitlement && Platform.OS === 'ios';
  const canLinkApple = useCanRender('linked-accounts.link-apple');
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
    /*
     * COS-928 — the `??` is what stops Android crashing on launch.
     *
     * useAuthRequest does Platform.select({ios:'iosClientId', android:
     * 'androidClientId', ...}) and then invariantClientId(), which THROWS on
     * `undefined` — synchronously, inside a useMemo, i.e. during this
     * component's render. EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID is defined in
     * no .env file, so every Android launch hit the route error boundary and
     * a fresh install could never reach a usable screen.
     *
     * Above the feature flag, so no flag flip avoided it: the hook is called
     * unconditionally and hooks cannot be conditional.
     *
     * The fallback value is never USED for a real Android sign-in — the button
     * is hidden on Android below, because there is no Android OAuth client, no
     * matching intent-filter and no matching package name yet. It exists only
     * so the hook can construct. invariantClientId rejects `undefined` and
     * nothing else, so any defined string defuses it.
     *
     * Deliberately NOT an empty EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID= in .env:
     * that also works, and is invisible — one .env sync from regressing.
     *
     * iOS is untouched: Platform.select reads iosClientId there.
     */
    androidClientId:
      process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ??
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
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

  // Handle Google auth response for linking.
  // All non-success outcomes (cancel, dismiss, error, locked) must reset the
  // linking state — otherwise the button is stuck in a loading state.
  useEffect(() => {
    if (!googleResponse) return;
    if (googleResponse.type === 'success') {
      const { id_token } = googleResponse.params;
      handleLinkGoogleToken(id_token);
    } else {
      setGoogleLinking(false);
      if (googleResponse.type === 'error') {
        setStatusMessage({ text: 'Google connection failed. Please try again.', isError: true });
      }
      // cancel / dismiss / locked — user bailed, no error message needed
    }
   
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
    try {
      const result = await promptGoogleAsync();
      // If user canceled the iOS system prompt or dismissed the web session,
      // reset the button immediately. Success is handled in the useEffect.
      if (result?.type !== 'success') {
        setGoogleLinking(false);
        if (result?.type === 'error') {
          setStatusMessage({ text: 'Google connection failed. Please try again.', isError: true });
        }
      }
    } catch {
      setGoogleLinking(false);
      setStatusMessage({ text: 'Google connection failed. Please try again.', isError: true });
    }
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
      {canViewLinkedAccounts && (
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
          {canLinkGoogle && (
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
          )}

          {/* Apple row — iOS only */}
          {Platform.OS === 'ios' && canLinkApple && (
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
      )}
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
