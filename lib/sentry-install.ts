/**
 * Thin adapter that wires the pure helpers in `sentry-config.ts` to the
 * real `@sentry/react-native` namespace.
 *
 * Why split this out:
 *   `sentry-config.ts` has no Sentry import so it can be loaded by a
 *   node-only contract test (the cos-app repo currently has no jest /
 *   vitest preset wired in; native node TS + node:test is the only test
 *   surface available). All Sentry-touching code lives here so the
 *   contract module stays pure.
 *
 * Audit reference: PHI-LOGGING-003 (SCRUM-364).
 */
import { Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { buildSentryInitOptions, type SentryLike } from '@/lib/sentry-config';

const sentryAdapter: SentryLike = {
  init: (options) => Sentry.init(options as Parameters<typeof Sentry.init>[0]),
  mobileReplayIntegration: (opts) =>
    Sentry.mobileReplayIntegration(
      opts as Parameters<typeof Sentry.mobileReplayIntegration>[0],
    ),
};

/**
 * Initialize Sentry with the cos-app HIPAA-safety contract.
 * Call once, as early as possible in app/_layout.tsx — before any
 * provider mounts, so module-load exceptions are still captured.
 *
 * COS-416 / SCRUM-578: `sentry-config.ts` is intentionally free of any
 * `react-native` import so it stays loadable in a plain-node test context
 * (see that file's module doc-comment). Resolving the OS version — and
 * deciding whether the native crash handler is safe to enable — therefore
 * happens here, where `react-native` is already imported, and the result
 * is passed into `buildSentryInitOptions` as `crashCaptureMode`.
 *
 * The iOS 26.5+ / Sentry Cocoa 8.58 (@sentry/react-native 7.11.0) combo
 * triggers a native self-crash when its ObjC exception hook fires, so on
 * iOS 26+ we drop to "js-only" (native crash handling + auto session
 * tracking both off) until the SDK is upgraded. JS-level captureException
 * still works either way.
 */
export function initSentry(dsn: string): void {
  const iosMajor = Platform.OS === 'ios'
    ? (typeof Platform.Version === 'string'
        ? parseInt(Platform.Version.split('.')[0], 10)
        : Number(Platform.Version))
    : 0;
  const crashCaptureMode: 'native' | 'js-only' =
    Platform.OS === 'ios' && iosMajor >= 26 ? 'js-only' : 'native';

  sentryAdapter.init(buildSentryInitOptions(dsn, sentryAdapter, crashCaptureMode));
}
