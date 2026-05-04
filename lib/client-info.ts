import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Client-info headers attached to every authenticated API request so the
 * backend can answer "which version of the app is this user running?"
 * without any explicit reporting endpoint.
 *
 * Captured once at module import and reused — none of these values
 * change during a single launch (an OTA only takes effect on the
 * NEXT launch, after a restart).
 *
 * Values:
 *   X-App-Version       Marketing version, e.g. "1.1.0"
 *   X-Build-Number      Native build number, e.g. "5"
 *   X-Runtime-Version   expo-updates runtime fingerprint, e.g. "1.1.0"
 *   X-Update-Id         OTA bundle UUID currently running, or "embedded"
 *                       when the .ipa-baked JS is in effect (no OTA yet)
 *   X-Channel           expo-updates release channel (e.g. "production")
 *   X-Platform          "ios" | "android" | "web"
 *
 * No user-identifying data — just build/runtime telemetry. Safe to log
 * server-side without HIPAA concerns.
 */
function buildClientInfo(): Record<string, string> {
  const appVersion = Constants.expoConfig?.version ?? Constants.manifest2?.extra?.expoClient?.version ?? '';
  const buildNumber =
    Platform.OS === 'ios'
      ? Constants.expoConfig?.ios?.buildNumber ?? ''
      : String(Constants.expoConfig?.android?.versionCode ?? '');
  const runtimeVersion = Updates.runtimeVersion ?? '';
  const updateId = Updates.isEmbeddedLaunch ? 'embedded' : Updates.updateId ?? 'unknown';
  const channel = Updates.channel ?? '';

  const headers: Record<string, string> = {
    'X-Platform': Platform.OS,
  };
  if (appVersion) headers['X-App-Version'] = appVersion;
  if (buildNumber) headers['X-Build-Number'] = buildNumber;
  if (runtimeVersion) headers['X-Runtime-Version'] = runtimeVersion;
  if (updateId) headers['X-Update-Id'] = updateId;
  if (channel) headers['X-Channel'] = channel;
  return headers;
}

export const CLIENT_INFO_HEADERS: Record<string, string> = buildClientInfo();
