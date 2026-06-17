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
import * as Sentry from '@sentry/react-native';
import { installSentryWithPhiScrub, type SentryLike } from '@/lib/sentry-config';

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
 */
export function initSentry(dsn: string): void {
  installSentryWithPhiScrub(dsn, sentryAdapter);
}
