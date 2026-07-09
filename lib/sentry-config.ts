/**
 * Sentry HIPAA scrub layer for cos-app — PURE helpers.
 *
 * This module has no `@sentry/react-native` import on purpose: it has to
 * be loadable in a plain-node test context (the cos-app project doesn't
 * currently have a jest preset wired in, but node 24 + node:test + native
 * TS support is enough for a contract test). The runtime wiring that
 * actually calls `Sentry.init` lives in `sentry-install.ts`.
 *
 * Background:
 *   COS-331 wrapped console.error in production to keep PHI off the local
 *   device log when Error / axios objects get logged. That fixed the
 *   device side of the pipe, but the Sentry side was still unhardened:
 *   any uncaught exception still walked into @sentry/react-native with
 *   its full request body, full URL, full breadcrumb trail. PHI-LOGGING-003
 *   in the 2026-06 audit flagged this.
 *
 * This module is the second half: every Sentry event passes through
 *   - beforeSend     → strips PHI from request, user, transaction,
 *                      extra, contexts, and the per-event breadcrumb tail
 *   - beforeBreadcrumb → strips request bodies + sensitive header sizes
 *                      from PHI-bearing fetch/xhr URLs (auth, patients,
 *                      health-plans, care-gaps)
 *   - mobileReplayIntegration → screen + image + vector masking ON. If a
 *                      future build flips on Session Replay sampling, the
 *                      masking contract is already in place.
 *
 * Companion contracts (kept in sync intentionally):
 *   cos-frontend/src/lib/sentry.ts             — web replay HIPAA contract
 *                                                 (SCRUM-293)
 *   cos-backend/src/utils/sentry.ts            — server-side beforeSend
 *                                                 + PHI field taxonomy
 *                                                 (SCRUM-363)
 *
 * The PHI field set mirrors the cos-backend logger / Sentry redact taxonomy
 * so a payload that's safe in CloudWatch is also safe in mobile Sentry.
 *
 * Security audit reference: PHI-LOGGING-003 (SCRUM-364).
 */
import type { ErrorEvent, EventHint, Breadcrumb, BreadcrumbHint } from '@sentry/core';
import { Platform } from 'react-native';

/**
 * Field names that must NEVER make it into Sentry, even buried in extra
 * context, breadcrumb data, or stack-frame locals. Mirrors the
 * cos-backend Sentry redactor (SCRUM-363) so the taxonomy is consistent
 * across services — change one, change both.
 *
 * Lookups are normalized: the key is lowercased AND non-alphanumeric
 * separators (`_`, `-`) are stripped before checking. That way a single
 * entry like `firstname` catches `firstName`, `first_name`, and
 * `first-name` without three separate set entries.
 *
 * Audit fix 2026-06-17 (verifier finding B): the bare `name` entry was
 * removed. It was added to catch `firstName` / `lastName` but those are
 * already covered explicitly; `name` was over-broad and erased
 * `event.contexts.device.name` (`"iPhone15,2"`) and
 * `event.contexts.os.name` (`"iOS"`) — essential triage information
 * with no PHI risk.
 */
export const PHI_FIELD_NAMES: ReadonlySet<string> = new Set<string>([
  // Credentials / tokens
  'password', 'token', 'accesstoken', 'refreshtoken', 'idtoken', 'apikey', 'secret',
  'authorization', 'cookie', 'pin', 'pinhash',
  // HIPAA 18 identifiers (normalized — lowercased + underscores/hyphens stripped
  // by `normalizeKey` at lookup time).
  'ssn', 'socialsecuritynumber',
  'dateofbirth', 'dob',
  'medicalrecordnumber', 'mrn',
  'firstname', 'lastname', 'fullname', 'givenname', 'familyname',
  'email', 'emailaddress',
  'phone', 'phonenumber',
  'address', 'streetaddress', 'zipcode', 'postalcode',
  'diagnosis', 'condition', 'medication', 'healthdata', 'identitytoken',
]);

/**
 * Normalize an object key for PHI lookup. Lowercases and strips `_` / `-`
 * so a single taxonomy entry like `firstname` catches `firstName`,
 * `first_name`, `first-name`, `FIRST_NAME`, etc.
 *
 * Mirrors the cos-backend redactor key-normalization rule (SCRUM-363).
 */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

/**
 * URL prefix regex matching every cos-backend route that carries PHI in
 * request OR response bodies. Used by beforeBreadcrumb to wipe `data.body`
 * and `data.request_body_size` from the breadcrumb the Sentry RN HTTP
 * integration auto-attaches on every fetch/xhr.
 *
 * Routes covered (per cos-backend route table, 2026-06):
 *   /v1/auth/*          login, refresh, pin/setup, pin/verify, MFA
 *   /v1/patients/*      FHIR patient resources
 *   /v1/health-plans/*  AI plan + plan items (carry condition / med text)
 *   /v1/care-gaps/*     gap analysis output (carries diagnosis)
 */
export const PHI_URL_PATTERN = /\/v1\/(auth|patients|health-plans|care-gaps)\b/;

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const EMAIL_RE = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g;
// US SSN pattern: 123-45-6789. Defensible signal for free-form text scrubbing;
// false positives (e.g. a tracking number that happens to match) are
// acceptable in an error event — over-redaction is the right failure mode.
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;

/** Replace UUIDs and emails in a URL/path with placeholders. */
export function redactUrl(url: string): string {
  return url.replace(UUID_RE, ':id').replace(EMAIL_RE, ':email');
}

/**
 * Apply free-form regex scrubs (email + SSN) to a string. Used everywhere
 * Sentry attaches raw text that an exception path could pull from — the
 * `Error.message` body, `event.message` for `captureMessage`, console
 * breadcrumb messages, and recursive object walks.
 *
 * Verifier finding A (2026-06-17): every throw funnels into
 * `event.exception.values[].value`, every `captureMessage` into
 * `event.message`. Both used to walk past the scrub layer. They go
 * through this function now.
 */
export function redactString(s: string): string {
  return s.replace(EMAIL_RE, '[REDACTED:email]').replace(SSN_RE, '[REDACTED:ssn]');
}

/**
 * Walk an object and replace any value whose key looks like PHI with
 * '[REDACTED]'. Recursive. Free-form strings get the email + SSN scrubs
 * applied as defense-in-depth — a stack-frame message containing a
 * patient email or SSN gets defanged even if it's not in a labeled field.
 *
 * Depth-capped at 8 to bound the work on accidental cycles.
 */
export function redactObject(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[REDACTED:depth]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((v) => redactObject(v, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (PHI_FIELD_NAMES.has(normalizeKey(k))) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = redactObject(v, depth + 1);
    }
  }
  return out;
}

/**
 * Strip a Sentry event of anything that could carry PHI before it leaves
 * the device. Runs synchronously inside Sentry's beforeSend hook.
 *
 * Returns the mutated event (Sentry's API expects null OR the event).
 * Never returns null — we still want the error to land, just scrubbed.
 */
export function scrubEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent {
  // 1. Request — strip body, cookies, query, all headers.
  //    cos-app talks to cos-backend with Bearer tokens; we never want any
  //    request body or auth header reaching Sentry's UI.
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.query_string;
    delete event.request.headers;
    if (typeof event.request.url === 'string') {
      event.request.url = redactUrl(event.request.url);
    }
  }

  // 2. User — only the Cognito sub (an opaque UUID) is safe. Drop email
  //    / username / IP if @sentry/react-native auto-attached them.
  if (event.user) {
    event.user = event.user.id ? { id: String(event.user.id) } : {};
  }

  // 3. Transaction name — could carry a patient UUID in the path.
  if (event.transaction) {
    event.transaction = redactUrl(event.transaction);
  }

  // 4. Extra + contexts — recursive field-name + email scrub.
  if (event.extra) {
    event.extra = redactObject(event.extra) as Record<string, unknown>;
  }
  if (event.contexts) {
    event.contexts = redactObject(event.contexts) as typeof event.contexts;
  }

  // 5. Exception values — verifier finding A.
  //    Every `throw` lands in `event.exception.values[].value` as the raw
  //    Error.message string. axios error messages routinely look like
  //    `Request failed with status code 400: {"email":"a@b.com",...}` —
  //    PHI walks right through the labeled-key scrub unless we run
  //    free-form regex over the message body.
  //
  //    Stack frame `vars` are the locals captured at the throw site; with
  //    sourcemaps + an unminified bundle, those can contain bound props
  //    like `{ patient: { firstName, dob, ... } }`. Run the recursive
  //    key+string redactor over them.
  const exceptionValues = event.exception?.values;
  if (exceptionValues) {
    for (const v of exceptionValues) {
      if (typeof v.value === 'string') {
        v.value = redactString(v.value);
      }
      const frames = v.stacktrace?.frames;
      if (frames) {
        for (const f of frames) {
          if (f.vars) {
            f.vars = redactObject(f.vars) as Record<string, unknown>;
          }
        }
      }
    }
  }

  // 6. event.message — the captureMessage / captureException(string) path.
  //    Can be a bare string OR a `{ message, formatted, params }` object;
  //    we handle both shapes.
  if (typeof event.message === 'string') {
    event.message = redactString(event.message);
  } else if (event.message && typeof event.message === 'object') {
    const msg = event.message as { message?: string; formatted?: string; params?: unknown[] };
    if (typeof msg.formatted === 'string') {
      msg.formatted = redactString(msg.formatted);
    }
    if (typeof msg.message === 'string') {
      msg.message = redactString(msg.message);
    }
    if (Array.isArray(msg.params)) {
      msg.params = msg.params.map((p) => (typeof p === 'string' ? redactString(p) : p));
    }
  }

  // 7. Tags — Sentry tags are indexable string key/value pairs; engineers
  //    sometimes tag events with `patient_id`, `email`, etc. Run the
  //    recursive key+string redactor; the tag map is shallow so depth
  //    bounding is a non-issue.
  if (event.tags) {
    event.tags = redactObject(event.tags) as typeof event.tags;
  }

  // 8. Breadcrumbs — defense-in-depth: even though beforeBreadcrumb
  //    already filtered each crumb as it was added, an SDK upgrade could
  //    change the integration order. Re-scrub the tail attached to this
  //    event before it ships.
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) => ({
      ...b,
      data: b.data ? (redactObject(b.data) as Record<string, unknown>) : b.data,
    }));
  }

  return event;
}

/**
 * Strip request bodies + sensitive size hints from fetch/xhr breadcrumbs
 * whose URL matches a PHI-bearing cos-backend route. Returns null only
 * if Sentry passed us a falsy breadcrumb (defensive — Sentry never does).
 *
 * The default @sentry/react-native HTTP integration auto-attaches
 *   data: { url, method, status_code, body, request_body_size }
 * on every fetch/xhr breadcrumb. `body` and `request_body_size` are the
 * fields that leak PHI; everything else is safe to keep for triage.
 */
export function scrubBreadcrumb(
  breadcrumb: Breadcrumb,
  _hint?: BreadcrumbHint,
): Breadcrumb | null {
  if (!breadcrumb) return null;

  // fetch / xhr — PHI-bearing route bodies and size hints.
  if (breadcrumb.category === 'fetch' || breadcrumb.category === 'xhr') {
    const url = (breadcrumb.data?.url as string | undefined) ?? '';
    if (PHI_URL_PATTERN.test(url)) {
      if (breadcrumb.data) {
        // Mutate in place — Sentry expects the same crumb back, mutated.
        delete breadcrumb.data.body;
        delete breadcrumb.data.request_body_size;
        delete breadcrumb.data.response_body_size;
      }
    }
    return breadcrumb;
  }

  // console — every console.log/warn/error becomes a breadcrumb. COS-331
  // wraps console.error in production but `console.log("patient", obj)`
  // and `console.warn(...)` are not wrapped, and dev-build crashes can
  // also be shipped to Sentry via early init. Run the free-form scrub
  // over the message and the recursive object scrub over the data bag.
  if (breadcrumb.category === 'console') {
    if (typeof breadcrumb.message === 'string') {
      breadcrumb.message = redactString(breadcrumb.message);
    }
    if (breadcrumb.data) {
      breadcrumb.data = redactObject(breadcrumb.data) as Record<string, unknown>;
    }
    return breadcrumb;
  }

  // navigation — react-navigation/expo-router push a crumb on every screen
  // transition. The `to` / `from` / `url` strings carry route params, and
  // routes like `/patient-detail/<uuid>` leak the patient identifier
  // straight into Sentry. UUID + email get replaced with placeholders.
  if (breadcrumb.category === 'navigation' && breadcrumb.data) {
    for (const k of ['to', 'from', 'url'] as const) {
      const v = breadcrumb.data[k];
      if (typeof v === 'string') {
        breadcrumb.data[k] = redactUrl(v);
      }
    }
    return breadcrumb;
  }

  return breadcrumb;
}

/**
 * Mobile Replay options — every PHI leak vector pinned explicitly so the
 * safety contract doesn't depend on @sentry/react-native defaults.
 *
 * cos-app doesn't currently enable Session Replay sampling (see COS-331
 * commit message), but the integration is registered with masking ON so
 * that if a future build flips `replaysOnErrorSampleRate` /
 * `replaysSessionSampleRate`, the contract is already in place — no
 * chance of a "we turned it on for 24 hours and leaked PHI" window.
 *
 * The contract test asserts every flag below; inline overrides at the
 * call site will break it.
 */
export const MOBILE_REPLAY_OPTIONS = Object.freeze({
  maskAllText: true,
  maskAllImages: true,
  maskAllVectors: true,
} as const);

/**
 * Sentry-like surface used by the installer — narrowed to the two
 * functions we touch (`init` and `mobileReplayIntegration`). Letting the
 * caller inject this is what lets the contract test assert what Sentry
 * actually receives, without spinning up the native bridge.
 */
export interface SentryLike {
  init: (options: Record<string, unknown>) => unknown;
  mobileReplayIntegration: (opts: Record<string, unknown>) => unknown;
}

/**
 * Build the Sentry.init options object. Exported separately so the
 * contract test can assert each field directly — keeps the test fast
 * and removes any chance of an inline override at the call site
 * silently weakening the PHI guarantees.
 */
export function buildSentryInitOptions(
  dsn: string,
  sentryLike: SentryLike,
): Record<string, unknown> {
  return {
    dsn,
    // Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: 0.1,
    // COS-416 (SCRUM-578 iOS 26.5 native crash workaround): Sentry Cocoa 8.58.0
    // (@sentry/react-native 7.11.0) crashes when its ObjC exception hook fires on
    // iOS 26+ — offset math against build 60 crash reports places the crash origin
    // ~1720 bytes from Sentry's crash handler entry points. Native handler is
    // OFF on iOS 26+ until we upgrade the SDK; JS-level captureException still
    // works, we just stop hooking the native exception path.
    enableNativeCrashHandling: Platform.OS === 'ios'
      ? (typeof Platform.Version === 'string'
          ? parseInt(Platform.Version.split('.')[0], 10) < 26
          : Platform.Version < 26)
      : true, // Android unchanged
    // COS-416: session tracking on iOS 26 might be equally affected by the
    // same native-hook crash path — gate it identically until the SDK upgrade.
    enableAutoSessionTracking: Platform.OS === 'ios'
      ? (typeof Platform.Version === 'string'
          ? parseInt(Platform.Version.split('.')[0], 10) < 26
          : Platform.Version < 26)
      : true, // Android unchanged
    // Healthcare app: do NOT send IP addresses, request bodies, or any
    // other "default PII". beforeSend is a belt-and-braces second pass.
    sendDefaultPii: false,
    // Last line of defence against PHI leaving the device in an error event.
    beforeSend: scrubEvent,
    // First line of defence against PHI in fetch/xhr breadcrumbs.
    beforeBreadcrumb: scrubBreadcrumb,
    // Replay masking contract — pinned ON even though sampling is OFF,
    // so flipping the sample rate later is a one-line change that doesn't
    // need a separate PHI review.
    integrations: [sentryLike.mobileReplayIntegration(MOBILE_REPLAY_OPTIONS)],
  };
}

/**
 * Install Sentry with the HIPAA-safety configuration wired up.
 *
 * The DSN is public (that's how Sentry's threat model works); the secret
 * is the auth token, which is only used at build time for source-map upload.
 *
 * Safe to call multiple times: Sentry.init dedupes on the DSN.
 *
 * The Sentry handle is injected so tests can verify the exact options
 * object without loading @sentry/react-native's native bridge. The default
 * argument resolves to the real Sentry namespace via the dedicated
 * `sentry-install.ts` adapter (imported by app/_layout.tsx); this file
 * stays pure so it can be loaded in a node-only test.
 */
export function installSentryWithPhiScrub(
  dsn: string,
  sentryLike: SentryLike,
): void {
  sentryLike.init(buildSentryInitOptions(dsn, sentryLike));
}
