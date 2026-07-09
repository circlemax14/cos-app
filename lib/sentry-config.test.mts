/**
 * HIPAA-safety contract for cos-app's Sentry wiring.
 *
 * Why a contract test:
 *   @sentry/react-native's defaults are not trustworthy for a healthcare
 *   app. We pin every PHI leak vector explicitly so that:
 *     1. A future Sentry minor that flips a default doesn't silently leak.
 *     2. An inline override at the call site is forced through this test.
 *     3. A reviewer can read this file and see the full safety surface.
 *
 * Runs under `node --test --experimental-strip-types` (node 24+). The
 * cos-app repo does not currently have a jest preset wired in — the
 * SCRUM-276 infra was reverted in the 2026-05-31 rollback — so this
 * test uses node:test directly. It only depends on the pure module
 * `lib/sentry-config.ts`, which has no `@sentry/react-native` import.
 *
 * Audit reference:
 *   PHI-LOGGING-003 — SCRUM-364
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PHI_FIELD_NAMES,
  PHI_URL_PATTERN,
  MOBILE_REPLAY_OPTIONS,
  buildSentryInitOptions,
  installSentryWithPhiScrub,
  redactObject,
  redactUrl,
  scrubBreadcrumb,
  scrubEvent,
  type SentryLike,
} from './sentry-config.ts';

// ---------------------------------------------------------------------------
// Mobile-replay options contract — every PHI vector explicitly pinned.
// ---------------------------------------------------------------------------

test('MOBILE_REPLAY_OPTIONS.maskAllText is true (text nodes carry patient names, DOB, labs)', () => {
  assert.equal(MOBILE_REPLAY_OPTIONS.maskAllText, true);
});

test('MOBILE_REPLAY_OPTIONS.maskAllImages is true (lab scans, uploaded photos)', () => {
  assert.equal(MOBILE_REPLAY_OPTIONS.maskAllImages, true);
});

test('MOBILE_REPLAY_OPTIONS.maskAllVectors is true (react-native-svg charts can render PHI text)', () => {
  assert.equal(MOBILE_REPLAY_OPTIONS.maskAllVectors, true);
});

test('MOBILE_REPLAY_OPTIONS is frozen (defends against runtime mutation by a misbehaving import)', () => {
  assert.equal(Object.isFrozen(MOBILE_REPLAY_OPTIONS), true);
});

// ---------------------------------------------------------------------------
// Sentry.init call-site contract — beforeSend, beforeBreadcrumb, mobile replay.
// ---------------------------------------------------------------------------

function makeStubSentry(): {
  sentry: SentryLike;
  initCalls: Array<Record<string, unknown>>;
  replayCalls: Array<Record<string, unknown>>;
} {
  const initCalls: Array<Record<string, unknown>> = [];
  const replayCalls: Array<Record<string, unknown>> = [];
  const sentry: SentryLike = {
    init: (options) => { initCalls.push(options); return undefined; },
    mobileReplayIntegration: (opts) => {
      replayCalls.push(opts);
      return { name: 'MobileReplay' };
    },
  };
  return { sentry, initCalls, replayCalls };
}

test('installSentryWithPhiScrub calls Sentry.init exactly once with the DSN', () => {
  const { sentry, initCalls } = makeStubSentry();
  installSentryWithPhiScrub('https://public@sentry.example/1', sentry);
  assert.equal(initCalls.length, 1);
  assert.equal(initCalls[0].dsn, 'https://public@sentry.example/1');
});

test('Sentry.init receives beforeSend that is the scrubEvent function (PHI-LOGGING-003)', () => {
  const { sentry, initCalls } = makeStubSentry();
  installSentryWithPhiScrub('https://x@y/1', sentry);
  assert.equal(typeof initCalls[0].beforeSend, 'function');
  // Identity check — catches "developer wrapped beforeSend in a one-liner
  // that loses the redaction" regressions.
  assert.equal(initCalls[0].beforeSend, scrubEvent);
});

test('Sentry.init receives beforeBreadcrumb that is the scrubBreadcrumb function', () => {
  const { sentry, initCalls } = makeStubSentry();
  installSentryWithPhiScrub('https://x@y/1', sentry);
  assert.equal(typeof initCalls[0].beforeBreadcrumb, 'function');
  assert.equal(initCalls[0].beforeBreadcrumb, scrubBreadcrumb);
});

test('Sentry.init registers mobileReplayIntegration with the masking contract', () => {
  const { sentry, initCalls, replayCalls } = makeStubSentry();
  installSentryWithPhiScrub('https://x@y/1', sentry);
  assert.equal(replayCalls.length, 1);
  // Identity match against MOBILE_REPLAY_OPTIONS — an inline override at
  // the call site (e.g. `{ ...MOBILE_REPLAY_OPTIONS, maskAllText: false }`)
  // would produce a new object and fail this.
  assert.equal(replayCalls[0], MOBILE_REPLAY_OPTIONS);
  // And the returned integration object is included in `integrations`.
  const integrations = initCalls[0].integrations as Array<{ name: string }>;
  assert.ok(integrations.some((i) => i.name === 'MobileReplay'));
});

test('Sentry.init disables sendDefaultPii (healthcare app — no IP, no UA, no body)', () => {
  const { sentry, initCalls } = makeStubSentry();
  installSentryWithPhiScrub('https://x@y/1', sentry);
  assert.equal(initCalls[0].sendDefaultPii, false);
});

test('buildSentryInitOptions exposes the same options for direct contract assertion', () => {
  const { sentry } = makeStubSentry();
  const opts = buildSentryInitOptions('https://x@y/1', sentry);
  assert.equal(opts.beforeSend, scrubEvent);
  assert.equal(opts.beforeBreadcrumb, scrubBreadcrumb);
  assert.equal(opts.sendDefaultPii, false);
});

// ---------------------------------------------------------------------------
// COS-416 / SCRUM-578 — crashCaptureMode gate. sentry-config.ts stays
// react-native-import-free; the OS-version resolution happens in
// sentry-install.ts and the *result* is passed in as crashCaptureMode.
// ---------------------------------------------------------------------------

test('buildSentryInitOptions defaults crashCaptureMode to "native" (pre-COS-416 behavior)', () => {
  const { sentry } = makeStubSentry();
  const opts = buildSentryInitOptions('https://x@y/1', sentry);
  assert.equal(opts.enableNativeCrashHandling, true);
  assert.equal(opts.enableAutoSessionTracking, true);
});

test('buildSentryInitOptions with crashCaptureMode="js-only" disables native crash handling + auto session tracking', () => {
  const { sentry } = makeStubSentry();
  const opts = buildSentryInitOptions('https://x@y/1', sentry, 'js-only');
  assert.equal(opts.enableNativeCrashHandling, false);
  assert.equal(opts.enableAutoSessionTracking, false);
});

test('buildSentryInitOptions with crashCaptureMode="native" explicitly matches the default', () => {
  const { sentry } = makeStubSentry();
  const opts = buildSentryInitOptions('https://x@y/1', sentry, 'native');
  assert.equal(opts.enableNativeCrashHandling, true);
  assert.equal(opts.enableAutoSessionTracking, true);
});

// ---------------------------------------------------------------------------
// scrubEvent — runtime behaviour on a fake PHI-laden event.
// ---------------------------------------------------------------------------

test('scrubEvent strips request body, cookies, query, headers (no PHI escape paths)', () => {
  const event = {
    request: {
      url: 'https://api.example.com/v1/patients/123e4567-e89b-12d3-a456-426614174000',
      data: { dob: '1980-01-01', firstName: 'Alice' },
      cookies: { session: 'abc' },
      query_string: 'q=Alice%20Smith',
      headers: { authorization: 'Bearer x', 'user-agent': 'cos-app/1.0' },
    },
  } as Parameters<typeof scrubEvent>[0];
  scrubEvent(event);
  assert.equal(event.request?.data, undefined);
  assert.equal(event.request?.cookies, undefined);
  assert.equal(event.request?.query_string, undefined);
  assert.equal(event.request?.headers, undefined);
  // UUID in the URL replaced.
  assert.match(event.request?.url ?? '', /\/v1\/patients\/:id$/);
});

test('scrubEvent reduces event.user to the Cognito sub UUID only', () => {
  const event = {
    user: { id: 'sub-abc', email: 'patient@example.com', username: 'alice', ip_address: '1.2.3.4' },
  } as Parameters<typeof scrubEvent>[0];
  scrubEvent(event);
  assert.deepEqual(event.user, { id: 'sub-abc' });
});

test('scrubEvent recursively redacts PHI keys inside extra context', () => {
  const event = {
    extra: {
      firstName: 'Alice',
      mrn: 'MR0001',
      nested: { lastName: 'Smith', safe: 'keep-me' },
      message: 'contact patient@example.com',
    },
  } as Parameters<typeof scrubEvent>[0];
  scrubEvent(event);
  const extra = event.extra as Record<string, unknown>;
  assert.equal(extra.firstName, '[REDACTED]');
  assert.equal(extra.mrn, '[REDACTED]');
  const nested = extra.nested as Record<string, unknown>;
  assert.equal(nested.lastName, '[REDACTED]');
  assert.equal(nested.safe, 'keep-me');
  assert.equal(extra.message, 'contact [REDACTED:email]');
});

test('scrubEvent re-scrubs the breadcrumb tail attached to the event', () => {
  const event = {
    breadcrumbs: [
      { category: 'fetch', data: { url: '/v1/patients/abc', body: '{"dob":"1980"}', firstName: 'A' } },
    ],
  } as unknown as Parameters<typeof scrubEvent>[0];
  scrubEvent(event);
  const crumb = event.breadcrumbs?.[0] as { data: Record<string, unknown> };
  assert.equal(crumb.data.firstName, '[REDACTED]');
});

// ---------------------------------------------------------------------------
// Verifier finding A — surfaces that used to walk past the scrub layer:
// event.exception.values[].value, .stacktrace.frames[].vars, event.message,
// event.tags. Each surface gets its own regression test.
// ---------------------------------------------------------------------------

test('scrubEvent redacts PHI inside event.exception.values[].value (Error.message body)', () => {
  const event = {
    exception: {
      values: [
        {
          type: 'Error',
          // Realistic: axios serializes the failing request into Error.message.
          value: 'Request failed: contact patient@example.com ssn=123-45-6789',
        },
      ],
    },
  } as unknown as Parameters<typeof scrubEvent>[0];
  scrubEvent(event);
  const v = event.exception?.values?.[0];
  assert.ok(v?.value, 'exception value preserved');
  assert.doesNotMatch(v.value, /patient@example\.com/, 'email redacted');
  assert.doesNotMatch(v.value, /123-45-6789/, 'SSN redacted');
  assert.match(v.value, /\[REDACTED:email\]/);
  assert.match(v.value, /\[REDACTED:ssn\]/);
});

test('scrubEvent redacts PHI in stack-frame vars (frame locals)', () => {
  const event = {
    exception: {
      values: [
        {
          stacktrace: {
            frames: [
              {
                function: 'submitPatient',
                vars: { firstName: 'Jane', mrn: 'MR0001', safe: 'keep' },
              },
            ],
          },
        },
      ],
    },
  } as unknown as Parameters<typeof scrubEvent>[0];
  scrubEvent(event);
  const vars = event.exception?.values?.[0]?.stacktrace?.frames?.[0]?.vars as Record<string, unknown>;
  assert.equal(vars.firstName, '[REDACTED]');
  assert.equal(vars.mrn, '[REDACTED]');
  assert.equal(vars.safe, 'keep');
});

test('scrubEvent redacts PHI in event.message (captureMessage path) — string form', () => {
  const event = {
    message: 'patient John ssn=123-45-6789 / contact john@example.com',
  } as unknown as Parameters<typeof scrubEvent>[0];
  scrubEvent(event);
  assert.equal(typeof event.message, 'string');
  assert.doesNotMatch(event.message as string, /123-45-6789/);
  assert.doesNotMatch(event.message as string, /john@example\.com/);
});

test('scrubEvent redacts PHI in event.message structured form ({ formatted, params })', () => {
  const event = {
    message: {
      message: 'patient %s requested record %s',
      formatted: 'patient John requested record contact john@example.com',
      params: ['John', 'john@example.com'],
    },
  } as unknown as Parameters<typeof scrubEvent>[0];
  scrubEvent(event);
  const msg = event.message as { formatted: string; params: unknown[] };
  assert.doesNotMatch(msg.formatted, /john@example\.com/);
  // params elements scrubbed individually
  assert.equal(msg.params[1], '[REDACTED:email]');
});

test('scrubEvent redacts PHI in event.tags (indexable string key/value)', () => {
  const event = {
    tags: {
      patient_email: 'a@b.com',
      mrn: 'MR0001',
      safe_release: 'build-52',
    },
  } as unknown as Parameters<typeof scrubEvent>[0];
  scrubEvent(event);
  const tags = event.tags as Record<string, unknown>;
  // Free-form string scrub catches the email in the *value*.
  assert.equal(tags.patient_email, '[REDACTED:email]');
  // Keyed redaction catches mrn.
  assert.equal(tags.mrn, '[REDACTED]');
  // Safe tag preserved verbatim.
  assert.equal(tags.safe_release, 'build-52');
});

// ---------------------------------------------------------------------------
// Verifier finding B — device.name + os.name must NOT be redacted.
// `name` was removed from the taxonomy; `firstname`/`lastname`/`fullname`/
// `givenname`/`familyname` still cover the PHI intent.
// ---------------------------------------------------------------------------

test('scrubEvent does NOT redact event.contexts.device.name (triage info)', () => {
  const event = {
    contexts: {
      device: { name: 'iPhone15,2', model: 'iPhone15,2' },
      os: { name: 'iOS', version: '26.5' },
    },
  } as unknown as Parameters<typeof scrubEvent>[0];
  scrubEvent(event);
  const ctxs = event.contexts as Record<string, Record<string, unknown>>;
  assert.equal(ctxs.device.name, 'iPhone15,2', 'device.name preserved');
  assert.equal(ctxs.os.name, 'iOS', 'os.name preserved');
});

test('scrubEvent still redacts firstName / lastName / fullName (the PHI cases name was meant to catch)', () => {
  const event = {
    extra: { firstName: 'Alice', lastName: 'Smith', fullName: 'Alice Smith', safe: 'keep' },
  } as unknown as Parameters<typeof scrubEvent>[0];
  scrubEvent(event);
  const extra = event.extra as Record<string, unknown>;
  assert.equal(extra.firstName, '[REDACTED]');
  assert.equal(extra.lastName, '[REDACTED]');
  assert.equal(extra.fullName, '[REDACTED]');
  assert.equal(extra.safe, 'keep');
});

// ---------------------------------------------------------------------------
// snake_case + kebab-case keys covered by normalizeKey()
// ---------------------------------------------------------------------------

test('redactObject treats snake_case PHI keys identically to camelCase (first_name, date_of_birth)', () => {
  const out = redactObject({
    first_name: 'Alice',
    last_name: 'Smith',
    date_of_birth: '1980-01-01',
    social_security_number: '123-45-6789',
    medical_record_number: 'MR0001',
    phone_number: '555-555-5555',
    street_address: '1 Main St',
    postal_code: '94110',
    zip_code: '94110',
    safe_key: 'keep',
  }) as Record<string, unknown>;
  assert.equal(out.first_name, '[REDACTED]');
  assert.equal(out.last_name, '[REDACTED]');
  assert.equal(out.date_of_birth, '[REDACTED]');
  assert.equal(out.social_security_number, '[REDACTED]');
  assert.equal(out.medical_record_number, '[REDACTED]');
  assert.equal(out.phone_number, '[REDACTED]');
  assert.equal(out.street_address, '[REDACTED]');
  assert.equal(out.postal_code, '[REDACTED]');
  assert.equal(out.zip_code, '[REDACTED]');
  assert.equal(out.safe_key, 'keep');
});

// ---------------------------------------------------------------------------
// scrubBreadcrumb — PHI URL pattern wipes body + size hints.
// ---------------------------------------------------------------------------

test('scrubBreadcrumb wipes body + request_body_size for /v1/auth fetch breadcrumbs', () => {
  const b = {
    category: 'fetch',
    data: {
      url: 'https://api.example.com/v1/auth/login',
      method: 'POST',
      status_code: 200,
      body: '{"email":"a@b.com","password":"hunter2"}',
      request_body_size: 42,
    },
  } as Parameters<typeof scrubBreadcrumb>[0];
  scrubBreadcrumb(b);
  assert.equal(b.data?.body, undefined);
  assert.equal(b.data?.request_body_size, undefined);
  // Safe fields preserved.
  assert.equal(b.data?.status_code, 200);
  assert.equal(b.data?.method, 'POST');
});

test('scrubBreadcrumb wipes body for /v1/patients, /v1/health-plans, /v1/care-gaps', () => {
  for (const url of [
    'https://api/v1/patients/abc',
    'https://api/v1/health-plans/2026-06',
    'https://api/v1/care-gaps?stage=open',
  ]) {
    const b = {
      category: 'xhr',
      data: { url, body: 'phi' },
    } as Parameters<typeof scrubBreadcrumb>[0];
    scrubBreadcrumb(b);
    assert.equal(b.data?.body, undefined, `body should be wiped for ${url}`);
  }
});

test('scrubBreadcrumb leaves non-PHI URLs alone (no false positives on /v1/version etc.)', () => {
  const b = {
    category: 'fetch',
    data: { url: 'https://api/v1/version', body: '{"build":51}' },
  } as Parameters<typeof scrubBreadcrumb>[0];
  scrubBreadcrumb(b);
  assert.equal(b.data?.body, '{"build":51}');
});

test('scrubBreadcrumb leaves non-fetch / non-console / non-navigation breadcrumbs alone (ui.click etc.)', () => {
  const b = {
    category: 'ui.click',
    data: { url: '/v1/patients/abc', body: 'irrelevant' },
  } as Parameters<typeof scrubBreadcrumb>[0];
  scrubBreadcrumb(b);
  assert.equal(b.data?.body, 'irrelevant');
});

// ---------------------------------------------------------------------------
// console + navigation breadcrumbs — verifier finding A.
// ---------------------------------------------------------------------------

test('scrubBreadcrumb redacts PHI in console-category breadcrumb message + data', () => {
  const b = {
    category: 'console',
    level: 'log',
    message: 'patient Alice contact alice@example.com',
    data: { firstName: 'Alice', mrn: 'MR0001', safe: 'keep' },
  } as unknown as Parameters<typeof scrubBreadcrumb>[0];
  scrubBreadcrumb(b);
  assert.doesNotMatch(b.message ?? '', /alice@example\.com/, 'email scrubbed from message');
  assert.match(b.message ?? '', /\[REDACTED:email\]/);
  const data = b.data as Record<string, unknown>;
  assert.equal(data.firstName, '[REDACTED]');
  assert.equal(data.mrn, '[REDACTED]');
  assert.equal(data.safe, 'keep');
});

test('scrubBreadcrumb redacts UUIDs in navigation breadcrumb to/from/url', () => {
  const b = {
    category: 'navigation',
    data: {
      from: '/home',
      to: '/patient-detail/123e4567-e89b-12d3-a456-426614174000',
      url: '/care-gap/00000000-0000-0000-0000-000000000001?email=a@b.com',
    },
  } as unknown as Parameters<typeof scrubBreadcrumb>[0];
  scrubBreadcrumb(b);
  const data = b.data as Record<string, string>;
  assert.equal(data.from, '/home', 'safe path preserved');
  assert.equal(data.to, '/patient-detail/:id', 'UUID replaced with :id');
  assert.match(data.url, /\/care-gap\/:id\?email=:email$/);
});

// ---------------------------------------------------------------------------
// Field taxonomy — mirrors cos-backend SCRUM-363 redactor.
// ---------------------------------------------------------------------------

test('PHI_FIELD_NAMES includes credential keys (password, token, authorization, cookie, pin)', () => {
  for (const k of ['password', 'token', 'authorization', 'cookie', 'pin']) {
    assert.ok(PHI_FIELD_NAMES.has(k), `expected ${k} in PHI taxonomy`);
  }
});

test('PHI_FIELD_NAMES includes HIPAA-18 identifiers (firstName-lower, mrn, dob, ssn, email)', () => {
  for (const k of ['firstname', 'mrn', 'dob', 'ssn', 'email']) {
    assert.ok(PHI_FIELD_NAMES.has(k), `expected ${k} in PHI taxonomy`);
  }
});

test('PHI_FIELD_NAMES does NOT include bare `name` (would redact device.name / os.name)', () => {
  // Verifier finding B (2026-06-17): the bare `name` entry erased essential
  // triage info. Keep this regression test pinned to prevent reintroduction.
  assert.equal(PHI_FIELD_NAMES.has('name'), false);
});

test('PHI_URL_PATTERN matches the four PHI-bearing route prefixes only', () => {
  assert.match('/v1/auth/login', PHI_URL_PATTERN);
  assert.match('/v1/patients/123', PHI_URL_PATTERN);
  assert.match('/v1/health-plans/x', PHI_URL_PATTERN);
  assert.match('/v1/care-gaps?stage=open', PHI_URL_PATTERN);
  // Non-PHI route prefixes don't match.
  assert.doesNotMatch('/v1/version', PHI_URL_PATTERN);
  assert.doesNotMatch('/v1/feature-flags', PHI_URL_PATTERN);
});

// ---------------------------------------------------------------------------
// redactUrl / redactObject helpers.
// ---------------------------------------------------------------------------

test('redactUrl replaces UUID + email with placeholders', () => {
  const out = redactUrl('/v1/patients/123e4567-e89b-12d3-a456-426614174000?email=a@b.com');
  assert.match(out, /\/v1\/patients\/:id\?email=:email$/);
});

test('redactObject caps recursion depth to bound work on cycles', () => {
  const out = redactObject({ a: { a: { a: { a: { a: { a: { a: { a: { a: { a: 1 } } } } } } } } } });
  // Walking 10 levels deep hits the depth cap.
  const flat = JSON.stringify(out);
  assert.ok(flat.includes('[REDACTED:depth]'));
});
