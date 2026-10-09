/**
 * COS-1268 — Block & Report in the patient app (cos-backend #536).
 *
 * The pure decisions are run directly; the wiring in the screens is pinned by
 * reading the source as text (node --test cannot load React Native).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  REPORT_REASONS,
  alsoBlockToSend,
  blockedPersonName,
  isSocialSafetyOn,
  otherMemberId,
  reportConfirmation,
  safetyErrorText,
} from '../../lib/social-safety.ts';

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── the gate ─────────────────────────────────────────────────────────

test('THE GATE: off while loading, off when the key is missing, on only for true', () => {
  // useIsFeatureFlagEnabled defaults to TRUE while loading — the trap.
  assert.equal(isSocialSafetyOn(undefined), false);
  assert.equal(isSocialSafetyOn({}), false);
  assert.equal(isSocialSafetyOn({ social_safety_enabled: false }), false);
  assert.equal(isSocialSafetyOn({ social_safety_enabled: true }), true);
});

test('no new surface reads the flag through useIsFeatureFlagEnabled', () => {
  for (const f of ['app/Home/conversation.tsx', 'components/social/SocialPanel.tsx', 'components/social/ReportSheet.tsx']) {
    assert.doesNotMatch(strip(read(f)), /useIsFeatureFlagEnabled/, f);
  }
  const screen = strip(read('app/Home/conversation.tsx'));
  assert.match(screen, /const safetyOn = isSocialSafetyOn\(flags\)/);
  assert.match(screen, /enabled: safetyOn && conversationId\.length > 0/, 'no members fetch with the flag off');
  assert.match(screen, /const other = safetyOn \? otherMemberId\(/, 'every action hangs off `other`');
  assert.match(screen, /\{other && !reporting && \(/, 'the ⋮ button is gated on `other`');
  assert.match(screen, /const reportable = other !== null && !mine;/, 'long-press only on THEIR messages');
});

// ── report ───────────────────────────────────────────────────────────

test('the six reasons, in order, with the server keys', () => {
  assert.deepEqual(
    REPORT_REASONS.map((r) => r.key),
    ['harassment', 'spam', 'sexual_content', 'hate_or_threats', 'self_harm', 'other'],
  );
  assert.equal(REPORT_REASONS.find((r) => r.key === 'self_harm')?.label, 'Someone may hurt themselves');
});

test('alsoBlock: the tick is sent as-is, except self_harm is always false', () => {
  assert.equal(alsoBlockToSend('harassment', true), true);
  assert.equal(alsoBlockToSend('spam', false), false);
  assert.equal(alsoBlockToSend('self_harm', true), false);
});

test('the app ALWAYS sends alsoBlock — the server reads a missing one as false', () => {
  const api = strip(read('services/api/conversations.ts'));
  assert.match(api, /comment\?: string; alsoBlock: boolean \}/, 'alsoBlock must be required on the input');
  const sheet = strip(read('components/social/ReportSheet.tsx'));
  assert.match(sheet, /React\.useState\(true\)/, 'Also block is ticked by default');
  assert.match(sheet, /alsoBlock: alsoBlockToSend\(r, alsoBlock\)/);
  assert.match(sheet, /reason !== 'self_harm' \? \(\s*<Pressable/, 'the box is hidden for self_harm');
  assert.match(sheet, /reason === 'self_harm' \? <CrisisSupportCard intro=\{WORRIED_ABOUT_SOMEONE_INTRO\} \/>/);
});

test('confirmation copy carries the server review window', () => {
  assert.equal(
    reportConfirmation('within 24 hours'),
    "We'll review this within 24 hours. We don't monitor conversations. In an emergency, call 911.",
  );
});

test('a report that blocked leaves the screen; one that did not stays', () => {
  const sheet = strip(read('components/social/ReportSheet.tsx'));
  assert.match(sheet, /onPress=\{filed\.blocked \? onBlocked : onClose\}/);
  const screen = strip(read('app/Home/conversation.tsx'));
  assert.match(screen, /onBlocked=\{leave\}/);
  // router.back() in a Tabs navigator goes Home; the inbox has to be named.
  assert.match(screen, /const leave = useCallback\(\(\) => \{[\s\S]*?router\.navigate\('\/Home\/inbox'/);
});

// ── people ───────────────────────────────────────────────────────────

test('otherMemberId: exactly one other person, or nothing', () => {
  const m = (...ids: string[]) => ids.map((userId) => ({ userId }));
  assert.equal(otherMemberId(m('me', 'them'), 'me'), 'them');
  assert.equal(otherMemberId(m('me', 'them'), null), null, 'unknown me: cannot tell who is who');
  assert.equal(otherMemberId(m('me'), 'me'), null);
  assert.equal(otherMemberId(m('me', 'a', 'b'), 'me'), null, 'a group has no single person to block');
  assert.equal(otherMemberId(undefined, 'me'), null);
});

test('a blocked row from an anonymous request never shows a name', () => {
  assert.equal(blockedPersonName({ displayName: 'Ann', anonymous: true }), 'Someone you blocked');
  assert.equal(blockedPersonName({}), 'Someone you blocked');
  assert.equal(blockedPersonName({ displayName: 'Ann' }), 'Ann');
});

test('Blocked people: fetched with the flag off, shown off only when there is a block to undo', () => {
  const panel = strip(read('components/social/SocialPanel.tsx'));
  assert.match(panel, /queryFn: \(\) => fetchConnections\('blocked'\)/);
  assert.match(panel, /enabled: canFind && showVisibility,/);
  assert.match(panel, /\{showVisibility && canFind && \(safetyOn \|\| blocked\.length > 0\) && \(/);
  assert.match(panel, /onPress=\{\(\) => unblock\.mutate\(item\.peerId\)\}/);
});

// ── errors ───────────────────────────────────────────────────────────

test('429 / 403 / 404 become sentences a patient can act on', () => {
  const axios = (status: number, code: string, details?: object) => ({ response: { status, data: { code, details } } });
  assert.match(safetyErrorText(axios(429, 'REPORT_RATE_LIMITED', { limit: 10 })), /^You can send 10 reports a day\. Please try again tomorrow\./);
  assert.match(safetyErrorText(axios(429, 'REPORT_RATE_LIMITED')), /today's report limit/);
  assert.equal(safetyErrorText(axios(403, 'NOT_A_MEMBER')), "You're no longer part of this conversation.");
  assert.match(safetyErrorText(axios(404, 'FEATURE_DISABLED')), /isn't available right now/);
  assert.match(safetyErrorText(axios(404, 'REPORT_TARGET_NOT_FOUND')), /couldn't find/);
  assert.match(safetyErrorText({ code: 'NETWORK_ERROR' }), /No connection/);
  assert.equal(safetyErrorText(new Error('boom')), 'Something went wrong. Please try again.');
});

// ── envelope & parity ────────────────────────────────────────────────

test('iOS 26 envelope: no Modal / Animated / svg, and no iOS-only branch', () => {
  for (const f of ['components/social/ReportSheet.tsx', 'lib/social-safety.ts']) {
    const src = strip(read(f));
    const imports = src.split('\n').filter((l) => l.trimStart().startsWith('import')).join('\n');
    for (const b of ['Modal', 'Animated', 'LayoutAnimation', 'react-native-svg', 'Portal']) {
      assert.ok(!imports.includes(b), `${f} must not import ${b}`);
    }
    assert.doesNotMatch(src, /Platform\.OS/, `${f}: Android mirrors iOS`);
  }
  const screen = strip(read('app/Home/conversation.tsx'));
  assert.doesNotMatch(screen, /from 'react-native-paper'/, 'the ⋮ menu is inline, not a Paper Menu');
});
