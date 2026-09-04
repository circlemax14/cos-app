// tests/unit/social-signin-retry-contract.test.mjs — COS-C6
//
// Google/Apple sign-up landed on a blank screen with no name and no data.
// The post-social-signin path had exactly ONE awaited data load —
// apiClient.get('/v1/auth/me') inside socialSignInWithBackend — fired with no
// retry immediately before the ~8-request prefetchAfterAuth burst. Every
// downstream consumer swallows a failed request into an empty success, so a
// throttled /v1/auth/me and "this user has no data" rendered identically.
//
// These are source-drift trip wires, not a behavioural mirror: the module is
// coordinated I/O (axios + SecureStore + expo modules) and mirroring it would
// only prove the mirror mirrors itself. Comments are STRIPPED before every
// grep — prose naming retryAsync is not a call to retryAsync.
//
// If a wire fails, do not loosen the regex. Read the diff and confirm the
// source change is intentional first.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const codeOnly = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const read = (...p) => codeOnly(readFileSync(join(REPO_ROOT, ...p), 'utf8'));

const SOCIAL_AUTH = read('services', 'social-auth.ts');
const ERROR_SCREEN = read('components', 'ConnectionErrorScreen.tsx');
const SPLASH = read('app', 'index.tsx');
const SIGN_IN = read('app', '(auth)', 'sign-in.tsx');
// The splash copy is asserted against the RAW component source too, so a
// reworded string inside a comment can never satisfy the wire.
const ERROR_SCREEN_RAW = readFileSync(
  join(REPO_ROOT, 'components', 'ConnectionErrorScreen.tsx'),
  'utf8',
);

test('social sign-in retries BOTH network calls via the shared retryAsync helper', () => {
  assert.match(
    SOCIAL_AUTH,
    /import\s*\{[^}]*retryAsync[^}]*\}\s*from\s*'@\/lib\/retry-async'/,
    'social-auth.ts must import retryAsync from lib/retry-async (do not hand-roll a retry loop)',
  );
  // The token exchange (publicApi.post) and the account load (auth/me).
  assert.match(
    SOCIAL_AUTH,
    /retryAsync\(\(\)\s*=>\s*publicApi\.post\(/,
    'the social token exchange must be wrapped in retryAsync',
  );
  assert.match(
    SOCIAL_AUTH,
    /retryAsync\(\(\)\s*=>\s*apiClient\.get\('\/v1\/auth\/me'\)\)/,
    "the /v1/auth/me load — the single choke point behind the blank screen — must be wrapped in retryAsync",
  );
  assert.equal(
    (SOCIAL_AUTH.match(/retryAsync\(/g) ?? []).length,
    2,
    'exactly the two network calls on the social path are retried',
  );
});

test('the retry policy is the default one — 401/403 must still fail fast', () => {
  // isTransientApiError declines to retry any 4xx other than 429. Passing a
  // shouldRetry override here would make a genuinely rejected Google/Apple
  // token spin for three attempts before telling the user.
  assert.doesNotMatch(
    SOCIAL_AUTH,
    /shouldRetry/,
    'do not override shouldRetry: a rejected provider token must not be retried',
  );
  assert.doesNotMatch(
    SOCIAL_AUTH,
    /attempts\s*:/,
    'retryAsync already defaults to 3 attempts; do not re-specify it',
  );
});

test('exhausted retries are reported as a retryable data load, not a dead end', () => {
  assert.match(
    SOCIAL_AUTH,
    /export async function fetchSocialSignInUser/,
    'the /v1/auth/me load must stay exported so the retry button can re-run it alone',
  );
  assert.match(
    SOCIAL_AUTH,
    /retryableDataLoad:\s*tokensStored\s*&&\s*isTransientApiError\(err\)/,
    'retryableDataLoad must require that tokens were stored — otherwise the retry ' +
      'button would re-run a load with no session behind it',
  );
});

test('ConnectionErrorScreen carries all three variants, splash copy verbatim', () => {
  // COS-890 split no-internet from session-unreadable on purpose: telling a
  // user with working wifi to "check your connection" sends them to their
  // router. This copy moved out of app/index.tsx and must not be reworded.
  for (const s of [
    "'No Internet Connection'",
    "'Check your connection and try again.'",
    "'Could not open your session'",
    "'This usually clears straight away. Tap retry to continue.'",
  ]) {
    assert.ok(
      ERROR_SCREEN_RAW.includes(s),
      `ConnectionErrorScreen must render the splash copy verbatim: ${s}`,
    );
  }
  assert.match(ERROR_SCREEN, /'Something went wrong'/, 'generic failure variant title');
  assert.match(
    ERROR_SCREEN,
    /'no-internet'\s*\|\s*'session-unreadable'\s*\|\s*'error'/,
    'the three variants are the whole contract',
  );
  assert.match(ERROR_SCREEN, /onRetry/, 'the screen must expose a Retry action');
  assert.match(ERROR_SCREEN, />Retry</, 'the button is labelled Retry');
});

test('ConnectionErrorScreen stays inside the iOS 26 rendering envelope', () => {
  const imports = ERROR_SCREEN.match(/from\s*'react-native'/g) ?? [];
  assert.equal(imports.length, 1, 'one react-native import');
  const primitives = ERROR_SCREEN.match(/import\s*\{([^}]*)\}\s*from\s*'react-native'/)[1];
  const allowed = new Set(['StyleSheet', 'Text', 'TouchableOpacity', 'View', 'Pressable']);
  for (const name of primitives.split(',').map((n) => n.trim()).filter(Boolean)) {
    assert.ok(allowed.has(name), `react-native primitive not in the iOS 26 envelope: ${name}`);
  }
  assert.doesNotMatch(ERROR_SCREEN, /Animated|ActivityIndicator/);
});

test('app/index.tsx delegates its two error states and keeps nothing behind', () => {
  assert.match(SPLASH, /import ConnectionErrorScreen from '@\/components\/ConnectionErrorScreen'/);
  assert.match(
    SPLASH,
    /<ConnectionErrorScreen\s+variant=\{state\}\s+onRetry=\{\(\)\s*=>\s*setRetryKey/,
    'the splash passes its GateState straight through and keeps the setRetryKey retry',
  );
  // The copy must live in exactly one place now.
  assert.doesNotMatch(SPLASH, /No Internet Connection/);
  assert.doesNotMatch(SPLASH, /Could not open your session/);
});

test('sign-in shows the error screen and retries the load, not the whole app', () => {
  assert.match(
    SIGN_IN,
    /<ConnectionErrorScreen\s+variant="error"\s+onRetry=\{retrySocialDataLoad\}/,
    'the exhausted-retry state renders the generic error variant',
  );
  assert.match(
    SIGN_IN,
    /const retrySocialDataLoad[\s\S]{0,400}?await fetchSocialSignInUser\(\)/,
    'retry must re-run the data load only',
  );
  assert.doesNotMatch(
    SIGN_IN,
    /retrySocialDataLoad[\s\S]{0,400}?(socialSignInWithBackend|promptGoogleAsync|signInWithApple|reloadAsync)/,
    'retry must NOT restart the app or bounce the user back through the provider',
  );
  assert.match(
    SIGN_IN,
    /res\.retryableDataLoad/,
    'both social handlers route the retryable failure to the error screen',
  );
  assert.equal(
    (SIGN_IN.match(/res\.retryableDataLoad/g) ?? []).length,
    2,
    'Google AND Apple both handle it — they share the choke point',
  );
});
