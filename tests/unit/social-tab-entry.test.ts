/**
 * COS-1063 — the Social tab leads to people-search, and does not crash iOS 26.
 *
 * Two separate failures are guarded here, and the second is the expensive one.
 *
 * 1. REACHABILITY. Vishal went to the Supports modal's Social tab looking for
 *    the new people-search and found it unchanged, because COS-1053/1058 hung
 *    it off Inbox only. A screen with routes and no way in is not shipped.
 *
 * 2. THE iOS 26 ENVELOPE. `react-native-paper-tabs` <TabScreen> with more than
 *    ONE direct child crashes the native snapshot on iOS 26. The Social tab's
 *    content is already a <TabsProvider>, so the new entry had to be NESTED
 *    with it inside a single flex:1 View — not rendered beside it. Getting
 *    that wrong is a launch crash for every iOS 26 patient, and it would not
 *    show up in any unit test that only checked the link exists.
 *
 * Source text rather than a render: this file is the whole Supports modal and
 * `node --test` cannot load React Native (see cos-app CLAUDE.md).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const modal = readFileSync(new URL('../../app/modal.tsx', import.meta.url), 'utf8');
const entry = readFileSync(
  new URL('../../components/social/FindPeopleEntry.tsx', import.meta.url),
  'utf8',
);
const layout = readFileSync(new URL('../../app/Home/_layout.tsx', import.meta.url), 'utf8');

/** Comments describe intent; only code proves it. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const modalCode = strip(modal);
const entryCode = strip(entry);

describe('COS-1063 — the Social tab reaches people-search', () => {
  test('THE POINT: the Supports modal renders the entry', () => {
    assert.match(modalCode, /<FindPeopleEntry\s*\/>/);
    assert.match(modalCode, /import \{ FindPeopleEntry \} from '@\/components\/social\/FindPeopleEntry'/);
  });

  test("it renders for the 'social' category only", () => {
    /*
     * Medical and Psychological are provider directories. Connecting to a
     * person is not what they are for, and an entry on all three would imply
     * the feature does something different in each.
     */
    assert.match(modalCode, /category\.id === 'social' && <FindPeopleEntry/);
  });

  test('it leads to BOTH screens, and to the same routes Inbox uses', () => {
    assert.match(entryCode, /router\.push\('\/Home\/find-people'/);
    assert.match(entryCode, /router\.push\('\/Home\/connection-requests'/);
    const inbox = readFileSync(new URL('../../app/Home/inbox.tsx', import.meta.url), 'utf8');
    assert.match(inbox, /'\/Home\/find-people'/);
    assert.match(inbox, /'\/Home\/connection-requests'/);
  });

  test('both target routes still exist as files', () => {
    for (const f of ['find-people', 'connection-requests']) {
      assert.ok(
        existsSync(new URL(`../../app/Home/${f}.tsx`, import.meta.url)),
        `app/Home/${f}.tsx is gone — the Social tab now leads nowhere`,
      );
    }
  });
});

describe('COS-1063 — iOS 26: TabScreen keeps exactly ONE direct child', () => {
  test('THE POINT: FindPeopleEntry is NESTED with TabsProvider, not a sibling of it', () => {
    /*
     * The crashing shape is:
     *     <TabScreen>{cond && <X/>}<TabsProvider>…  <- two direct children
     * The safe shape is:
     *     <TabScreen><View style={{flex:1}}>{cond && <X/>}<TabsProvider>…
     *
     * COS-1101 RELAXED THE FORM OF THIS CHECK, NOT ITS SUBSTANCE.
     *
     * It used to require the three to be literally adjacent, which broke the
     * moment anything else was added inside the wrapper — the Supports filter,
     * in that case. Adjacency was never the rule: the rule is that TabScreen
     * receives ONE child, and everything else lives inside it. So this now
     * asserts containment and order, which is what actually prevents the
     * crash, and stays true as the wrapper gains contents.
     */
    const open = modalCode.indexOf('<View style={{ flex: 1 }}>');
    assert.ok(open > 0, 'the flex:1 wrapper View must exist');

    const close = modalCode.indexOf('</TabsProvider>', open);
    assert.ok(close > open, 'TabsProvider must close inside the wrapper');

    const inside = modalCode.slice(open, close);
    const entryAt = inside.indexOf('<FindPeopleEntry />');
    const providerAt = inside.indexOf('<TabsProvider');

    assert.ok(entryAt > 0, 'FindPeopleEntry must be INSIDE the wrapper, not a sibling of it');
    assert.ok(providerAt > 0, 'TabsProvider must be inside the same wrapper');
    assert.ok(
      entryAt < providerAt,
      'FindPeopleEntry must come before TabsProvider — after it, the entry renders ' +
        'below the sub-tabs instead of above them',
    );
  });

  test('the wrapper View is closed after TabsProvider', () => {
    assert.match(modalCode, /<\/TabsProvider>\s*<\/View>/);
  });

  test('the entry itself imports no primitive outside the iOS 26 envelope', () => {
    /*
     * ADR-0003. Modal, Animated, LayoutAnimation and react-native-svg are the
     * four that have crashed this app on a cold mount.
     */
    const banned = ['Animated', 'LayoutAnimation', 'react-native-svg', 'Modal'];
    /*
     * Real `import` statements only, with comments stripped first. The initial
     * version of this test scanned the raw file and failed on this component's
     * OWN header, which names those four in order to forbid them — a guard
     * that trips on the documentation of the rule it enforces is a guard
     * nobody will keep.
     */
    const imports = strip(entry)
      .split('\n')
      .filter((l) => l.trimStart().startsWith('import'))
      .join('\n');
    for (const b of banned) {
      assert.ok(!imports.includes(b), `FindPeopleEntry must not import ${b} (iOS 26 envelope)`);
    }
  });
});

describe('COS-1063 — the old duplicate People screen is gone', () => {
  test('THE POINT: its files are deleted, not merely unreachable', () => {
    /*
     * It had been unreachable since 2026-08-18 and still shipped in every
     * bundle, pointed at a live API, while a second implementation of the same
     * feature was built beside it. Leaving it would invite exactly that again.
     */
    for (const f of [
      '../../app/Home/connections.tsx',
      '../../services/api/connections.ts',
      '../../hooks/use-social-connect-flag.ts',
    ]) {
      assert.ok(!existsSync(new URL(f, import.meta.url)), `${f} should have been deleted`);
    }
  });

  test('its tab registration is gone too, or expo-router mounts a stray tab', () => {
    /*
     * expo-router registers every file in app/Home as a TAB unless told
     * otherwise — but the inverse also matters: a <Tabs.Screen> naming a file
     * that no longer exists is a route pointing at nothing.
     */
    assert.ok(!/name="connections"/.test(layout), 'the connections Tabs.Screen entry must be removed');
  });
});


describe('COS-1064 — the Social entry is gated by the plan', () => {
  test('THE POINT: each row is gated on ITS OWN destination', () => {
    /*
     * Chat is a plan feature now. A row that leads somewhere the plan excludes
     * would push the patient to a screen `useEnforceScreenAccess` immediately
     * redirects away from — which teaches them the app is broken, not that
     * they do not have the feature.
     *
     * Gated separately because a plan could grant answering requests without
     * granting directory search; one shared flag would make that unexpressible.
     */
    assert.match(entryCode, /const canFind = canShow\('find-people'\)/);
    assert.match(entryCode, /const canRequests = canShow\('connection-requests'\)/);
    assert.match(entryCode, /\{canFind && \(/);
    assert.match(entryCode, /\{canRequests && \(/);
  });

  test('with neither granted it renders NOTHING, not an empty block', () => {
    assert.match(entryCode, /if \(!canFind && !canRequests\) return null/);
  });

  test("it reads the app's own gate, not a second copy of the rule", () => {
    assert.match(entryCode, /import \{ useCanShowScreen \} from '@\/hooks\/use-feature-permissions'/);
  });
});
