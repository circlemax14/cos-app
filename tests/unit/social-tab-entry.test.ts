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
  new URL('../../components/social/SocialPanel.tsx', import.meta.url),
  'utf8',
);
const layout = readFileSync(new URL('../../app/Home/_layout.tsx', import.meta.url), 'utf8');

/** Comments describe intent; only code proves it. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const modalCode = strip(modal);
const entryCode = strip(entry);

describe('COS-1063/COS-1124 — the Social tab reaches people-search, in place', () => {
  test('THE POINT: the Supports modal renders the entry', () => {
    assert.match(modalCode, /<SocialPanel\s*\/>/);
    assert.match(modalCode, /import \{ SocialPanel \} from '@\/components\/social\/SocialPanel'/);
  });

  /*
   * COS-1113 — the test above passed for weeks while the entry was UNREACHABLE.
   *
   * It regex-matched the source text of modal.tsx, so it could see that the
   * element existed but not that its branch never executed. The entry sat only
   * in the else branch of `showEmptyNonMedical ? … : …`, and that condition is
   * true on every open for Social: no EHR provider can be filed into a social
   * sub-category (matchProviderToSubCategory hard-codes 'medical'), the server
   * only ever sends category 'Medical', and manual members are unhydrated
   * useState. So the entry rendered only after a patient manually added a
   * Social member in that same modal session, and vanished when it closed.
   *
   * A presence assertion cannot catch that. This one pins the POSITION.
   */
  test('THE POINT: Social SHORT-CIRCUITS the empty-state ternary entirely', () => {
    /*
     * COS-1113 hoisted the entry above the ternary because Social always took
     * the empty branch and the entry lived in the other one. COS-1126 goes
     * further: Social does not enter the ternary at all, so the add-member
     * form cannot render underneath the panel.
     */
    const socialAt = modalCode.indexOf("category.id === 'social' ? (");
    const ternaryAt = modalCode.indexOf('showEmptyNonMedical ? (');
    assert.ok(socialAt > -1, 'Social must be its own branch, not a condition inside the ternary');
    assert.ok(ternaryAt > -1, 'the empty-state ternary moved — re-check this guard');
    assert.ok(socialAt < ternaryAt, 'the Social branch must be tested first');
  });

  test("it renders for the 'social' category only", () => {
    /*
     * Medical and Psychological are provider directories. Connecting to a
     * person is not what they are for, and an entry on all three would imply
     * the feature does something different in each.
     */
    assert.match(modalCode, /category\.id === 'social' \? \(/);
  });

  test('COS-1124 THE POINT: it does the work in place and navigates NOWHERE', () => {
    /*
     * Vishal: "if I click on Find people another modal is opening, which is
     * actually wrong — whatever we need to do is within the same screen."
     *
     * Leaving a modal to do the modal's job is strange anywhere, and worse
     * here: the Supports modal UNMOUNTS when you go, so you return to a tab
     * that has forgotten which category and which filter you were on.
     */
    assert.doesNotMatch(entryCode, /router\.push/);
    assert.doesNotMatch(entryCode, /from 'expo-router'/);
    // Both jobs are now modes on one panel.
    assert.match(entryCode, /type Mode = 'find' \| 'requests'/);
    assert.match(entryCode, /setMode\(id\)/);
  });

  test('the standalone routes remain, because Inbox still links to them', () => {
    // COS-1124 removed the Social tab's navigation, not the screens. Inbox's
    // header button and pending banner are a second, legitimate door.
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
  test('THE POINT: SocialPanel is NESTED with TabsProvider, not a sibling of it', () => {
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
    const entryAt = inside.indexOf('<SocialPanel />');
    const providerAt = inside.indexOf('<TabsProvider');

    assert.ok(entryAt > 0, 'SocialPanel must be INSIDE the wrapper, not a sibling of it');
    assert.ok(providerAt > 0, 'TabsProvider must be inside the same wrapper');
    assert.ok(
      entryAt < providerAt,
      'SocialPanel must come before TabsProvider — after it, the entry renders ' +
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
      assert.ok(!imports.includes(b), `SocialPanel must not import ${b} (iOS 26 envelope)`);
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
    // COS-1124 — the gate now selects a MODE rather than a navigation row, but
    // the rule is unchanged: a plan could grant answering requests without
    // granting directory search, and one shared flag makes that unexpressible.
    assert.match(entryCode, /\{canFind && <ModeButton/);
    assert.match(entryCode, /\{canRequests && \(/);
  });

  test('with neither granted it renders NOTHING, not an empty block', () => {
    assert.match(entryCode, /if \(!canFind && !canRequests\) return null/);
  });

  test("it reads the app's own gate, not a second copy of the rule", () => {
    assert.match(entryCode, /import \{ useCanShowScreen \} from '@\/hooks\/use-feature-permissions'/);
  });
});

describe('COS-1125 — regional suggestions, and the consent that guards them', () => {
  const panel = readFileSync(
    new URL('../../components/social/SocialPanel.tsx', import.meta.url),
    'utf8',
  );

  test('THE POINT: suggestions follow discoverability, and require it', () => {
    /*
     * COS-1126 removed the second switch on Vishal's instruction — suggestions
     * are on by default now. The narrowing that remains is the load-bearing
     * one: someone who is not findable is neither suggested nor shown
     * suggestions, so this is never a browse of the patient list.
     */
    assert.doesNotMatch(panel, /Suggest me to people in my area/);
    assert.match(panel, /enabled: canFind && visibilityQ\.data\?\.discoverable === true/);
    assert.match(panel, /\{discoverable && \(suggestionsQ\.data\?\.length \?\? 0\) > 0/);
  });

  test('COS-1126: visibility is an icon beside the pills, and its COLOUR carries the state', () => {
    // The switch is one tap away instead of in front of you, so the icon has
    // to say which way it is set at a glance — and with a distinct glyph, not
    // one shape in two tints.
    assert.match(panel, /setShowVisibility/);
    assert.match(panel, /discoverable \? 'visibility' : 'visibility-off'/);
    assert.match(panel, /color=\{discoverable \? colors\.tint : colors\.icon\}/);
  });

  test('suggestions show only while the search box is empty', () => {
    // Once someone types they have said what they want; a "you may know" list
    // under their own results is noise.
    const sugAt = panel.indexOf('People in your area');
    const minAt = panel.indexOf('trimmed.length < MIN_QUERY');
    const elseAt = panel.indexOf('resultsQ.isLoading ?');
    assert.ok(minAt > -1 && sugAt > minAt && sugAt < elseAt,
      'the suggestions block must sit inside the below-minimum branch');
  });

  test('a suggestion renders identically to a search hit', () => {
    // Same component for both, so a suggestion can never be made to look more
    // endorsed than something the patient searched for themselves.
    const rows = panel.match(/<PersonRow/g) ?? [];
    assert.equal(rows.length, 2, 'search results and suggestions must share one row component');
  });

  test('the panel never names a region', () => {
    // The screen says "in your area" and is told no more — the region code is
    // the thing the feature exists to protect.
    assert.doesNotMatch(panel, /regionCode/);
  });
});

describe('COS-1128 — in-flight state belongs to the row that owns it', () => {
  const panel = readFileSync(
    new URL('../../components/social/SocialPanel.tsx', import.meta.url),
    'utf8',
  );

  test('THE POINT: a spinner shows on the row being sent, not on all of them', () => {
    // `connect.isPending` alone is true for EVERY row while any one request is
    // in flight, so tapping Connect on one person greyed out the whole list and
    // gave no sign which one was working. The mutation's `variables` carries
    // the id being sent, so the state can be attributed to its own row.
    assert.match(panel, /connect\.isPending && connect\.variables === item\.userId/);
    assert.doesNotMatch(panel, /pending=\{connect\.isPending\}/);
  });

  test('Accept and Decline are attributed the same way', () => {
    // Identical defect one tab over, and the next one the tester would hit.
    assert.match(panel, /accept\.isPending && accept\.variables === peerId/);
    assert.match(panel, /decline\.isPending && decline\.variables === peerId/);
    assert.doesNotMatch(panel, /const busy = accept\.isPending \|\| decline\.isPending/);
  });

  test('the button holds its size when the label becomes a spinner', () => {
    // A control that changes width under the finger that just tapped it reads
    // as a glitch even when the outcome is correct.
    assert.match(panel, /minWidth: 86/);
    assert.match(panel, /<ActivityIndicator size="small"/);
  });

  test('busy is announced to screen readers, not just drawn', () => {
    assert.match(panel, /accessibilityState=\{\{ disabled: requested \|\| sending, busy: sending \}\}/);
  });
});

describe('COS-1129 — requests you sent, and withdrawing them', () => {
  const panel = readFileSync(
    new URL('../../components/social/SocialPanel.tsx', import.meta.url),
    'utf8',
  );

  test('THE POINT: "Requested" comes from the SERVER, not just local state', () => {
    // A sent request used to vanish: the row left suggestions (correctly — they
    // are excluded) and the button reverted to "Connect" because the only
    // record was component state, lost when the modal closed. The server knew
    // the whole time; nothing asked it.
    assert.match(panel, /queryKey: \['connections', 'pending-out'\]/);
    assert.match(panel, /alreadyRequested\.has\(item\.userId\)/);
  });

  test('sent requests are listed under Requests, with Cancel', () => {
    assert.match(panel, /Sent by you/);
    assert.match(panel, /cancel\.mutate\(item\.peerId\)/);
  });

  test('cancelling clears the optimistic flag as well as refetching', () => {
    // Otherwise the row still reads "Requested" after the request it refers to
    // has gone.
    assert.match(panel, /delete next\[peerId\]/);
  });

  test('the cancel spinner is per-row, like every other action here', () => {
    assert.match(panel, /cancel\.isPending && cancel\.variables === item\.peerId/);
  });

  test('the empty state covers BOTH directions', () => {
    assert.match(panel, /No requests waiting, and none sent\./);
  });
});

describe('COS-1231 — invite someone to your care circle by email', () => {
  const panel = readFileSync(
    new URL('../../components/social/SocialPanel.tsx', import.meta.url),
    'utf8',
  );
  const panelCode = strip(panel);
  const inbox = readFileSync(new URL('../../app/Home/inbox.tsx', import.meta.url), 'utf8');

  test('SCREEN 1 THE POINT: find mode offers the invitation, and says what it costs', () => {
    /*
     * The consent model is one sentence and it is on the card, not only inside
     * the sheet, because this is the screen on which the patient decides
     * whether to hand us somebody else's email address at all.
     */
    assert.match(panelCode, /Not on Circle Support yet\?/);
    assert.match(panelCode, /Invite them by email\./);
    assert.match(
      panelCode,
      /They choose whether to join — nothing is shared until they accept\./,
    );
    // It is reachable: the card calls the thing that opens the sheet.
    assert.match(panelCode, /onPress=\{startInvite\}/);
    assert.match(panelCode, /setMode\('invite'\)/);
  });

  test('SCREEN 2/3 are MODES — not a Modal, not a route, not an Alert', () => {
    /*
     * Each of the three alternatives is a known failure here:
     *   - a react-native Modal stacked inside this presentation:'modal' screen
     *     is the documented iOS 26.5 SIGABRT class;
     *   - a pushed route unmounts the Supports modal, which is COS-1124;
     *   - Alert.alert renders a Modal, so it is the first one again.
     * The envelope assertions above already forbid the imports; this pins that
     * the two new screens actually took the remaining shape.
     */
    assert.match(panelCode, /mode === 'invite' && canFind/);
    assert.match(panelCode, /mode === 'invite-sent' && canFind/);
    assert.doesNotMatch(panelCode, /Alert\.alert/);
    assert.doesNotMatch(panelCode, /Portal/);
  });

  test('the Mode union APPENDS, because the regex above is unanchored', () => {
    /*
     * `/type Mode = 'find' \| 'requests'/` has no end anchor, so appending
     * passes and inserting before 'requests' fails. That is easy to trip over
     * when alphabetising, so the required order is pinned explicitly rather
     * than left as a property of someone else's regex.
     */
    assert.match(
      panelCode,
      /type Mode = 'find' \| 'requests' \| 'invite' \| 'invite-sent'/,
    );
  });

  test('THE POINT: the note cap is enforced in CODE, not only as maxLength', () => {
    // maxLength on a TextInput does not survive a paste on every platform, and
    // the note is the one free-text field that leaves the platform — it is read
    // by a stranger, in an email, from a healthcare-branded From line.
    assert.match(panelCode, /const MAX_NOTE = 280/);
    assert.match(panelCode, /slice\(0, MAX_NOTE\)/);
    // And the counter is live, so a patient sees the cut rather than meeting it
    // in the mail their daughter receives.
    assert.match(panelCode, /\$\{inviteNote\.length\}\/\$\{MAX_NOTE\}/);
  });

  test('the promise card says all four things it promises', () => {
    assert.match(panelCode, /One email, and that&apos;s it\./);
    assert.match(panelCode, /No marketing, no reminders\./);
    assert.match(panelCode, /None of your health information is included\./);
    assert.match(panelCode, /We will not email them again unless you send a new/);
  });

  test('SCREEN 3 THE POINT: the confirmation cannot claim a send that failed', () => {
    /*
     * A Resend 429 or 5xx is swallowed server-side into delivered:false with no
     * retry, no backoff and no queue. This screen NAMES the recipient's
     * address, so assuming success would be the app stating something untrue to
     * a patient who then waits for a reply that can never come.
     */
    assert.match(panelCode, /sentInvite\.delivered/);
    assert.match(panelCode, /We could not send that email/);
    assert.match(panelCode, /We emailed \$\{sentInvite\.email\}/);
    // The three "what happens next" steps, in the order the design sets.
    assert.match(panelCode, /Their link works for 14 days/);
    assert.match(panelCode, /they appear under Requests for you to confirm/);
    assert.match(panelCode, /You choose what they can see later, and separately\./);
    assert.match(panelCode, /We won&apos;t email them again unless you send a new invitation\./);
  });

  test('SCREEN 4 THE POINT: email invitations are their OWN section', () => {
    /*
     * Beside the in-app ones, never merged with them. One row is a request a
     * real account has received and can answer today; the other is an email to
     * an address that may belong to nobody. Merged, a typo looks like a person
     * who is thinking about it.
     */
    assert.match(panelCode, /Invitations you sent \(/);
    assert.match(panelCode, /Sent by you \(/);
    assert.match(panelCode, /INVITED/);
    assert.match(panelCode, /withdrawInvite\.mutate\(item\.inviteId\)/);
    assert.match(panelCode, /Email invitations expire after 14 days\. We don&apos;t send reminders\./);
  });

  test('expiry comes from the SERVER, never recomputed on the device', () => {
    /*
     * 'expired' is derived server-side on every read because DynamoDB's TTL
     * purge runs up to 48h late. Two clocks disagreeing about whether a link is
     * dead is how a screen ends up offering Withdraw on something already gone.
     */
    assert.match(panelCode, /i\.status === 'invited'/);
    assert.doesNotMatch(panelCode, /Date\.parse/);
    assert.doesNotMatch(panelCode, /Date\.now\(\) > /);
  });

  test('the withdraw spinner is per-row, like every other action here', () => {
    assert.match(panelCode, /withdrawInvite\.isPending && withdrawInvite\.variables === item\.inviteId/);
  });

  test('the empty state counts email invitations as "sent"', () => {
    // Otherwise the panel said nothing had been sent directly above a list of
    // invitations that had.
    assert.match(panelCode, /openInvites\.length === 0 \?/);
  });

  test('THE POINT: the panel SCROLLS — it never has', () => {
    /*
     * Zero ScrollView/FlatList before this, while modal.tsx renders it bare and
     * every sibling branch of that ternary wraps its content in one. Search
     * results and the sent list already ran off the bottom unreachably; a
     * 280-character note and four chips on top of that would put Send below the
     * fold in accessibility mode. Same class as COS-1225, which cost the
     * clinical lead two days locked out of the app on an iPad.
     */
    assert.match(panelCode, /<ScrollView/);
    assert.match(panelCode, /keyboardShouldPersistTaps="handled"/);
  });

  test('THE POINT: teal LABELS use the AA accent, not colors.tint', () => {
    /*
     * colors.tint (#008080) is 4.38:1 on the card and 3.42:1 on the dark card —
     * under AA for text, on an audience that is largely 60+ and partly visually
     * impaired. The visibility ICON keeps it (non-text is a 3:1 bar, pinned by
     * COS-1126 above); every label does not.
     */
    assert.match(panelCode, /const actionTint = settings\.isDarkTheme \? tokens\.primary : tokens\.primaryDark/);
    assert.doesNotMatch(panelCode, /color: colors\.tint,/);
  });

  test('type steps with the SCREEN, through the one existing ladder', () => {
    /*
     * getScaledFontSize does not enlarge on a tablet — isTablet() only removes
     * phone dampening — so fs(13) rendered at 13pt on a 10" iPad. The
     * breakpoints are not redefined here: layoutForWidth owns the ladder and
     * INTAKE_TYPE_STEP owns the step. A second set of thresholds is the drift
     * this codebase keeps shipping.
     */
    assert.match(panelCode, /layoutForWidth\(width\)/);
    assert.match(panelCode, /intakeFontSize\(base, breakpoint, getScaledFontSize\)/);
  });

  test('the email field reuses AccessibleInput, which had NO importers', () => {
    // label + error + hint, real primitives, a target that already clears 44pt.
    // Writing a fourth bordered TextInput beside it is how this codebase ends
    // up with two of everything.
    assert.match(panelCode, /import \{ AccessibleInput \} from '@\/components\/ui\/accessible-input'/);
    assert.match(panelCode, /<AccessibleInput/);
  });

  test('one email validator, shared with the screen it was copied from', () => {
    const proxy = readFileSync(new URL('../../app/Home/proxy-management.tsx', import.meta.url), 'utf8');
    assert.match(panelCode, /import \{ isValidEmailFormat \} from '@\/lib\/email-format'/);
    assert.match(proxy, /import \{ isValidEmailFormat \} from '@\/lib\/email-format'/);
    // The inline copy it replaced must be gone, not merely unused.
    assert.doesNotMatch(proxy, /const emailRegex = /);
  });

  test('SCREEN 5 THE POINT: Inbox is a second door, and the old two survive', () => {
    /*
     * Inbox is where someone notices a person is missing. It lands on the
     * Social tab rather than opening a sheet of its own, because the sheet is a
     * MODE of SocialPanel inside the Supports modal and a second copy here
     * would be a second implementation of the same screen.
     */
    assert.match(inbox, /'\/modal\?tab=social'/);
    assert.match(inbox, /Someone missing from here\? Invite them by email\./);
    // Unchanged, and still pinned above — repeated here so a future edit to
    // this screen sees all three doors in one place.
    assert.match(inbox, /'\/Home\/find-people'/);
    assert.match(inbox, /'\/Home\/connection-requests'/);
  });

  test('the deep link is read by modal.tsx — the panel still takes NO props', () => {
    /*
     * SocialPanel cannot be told which mode to open in: the assertions at the
     * top of this file pin `<SocialPanel />` twice, once by regex and once by
     * indexOf, and `from 'expo-router'` is banned inside it. So the param is
     * resolved where the tabs are.
     */
    assert.match(modalCode, /useLocalSearchParams<\{ tab\?: string \}>\(\)/);
    assert.match(modalCode, /defaultIndex=\{initialTabIndex\}/);
    assert.doesNotMatch(modalCode, /<SocialPanel [a-zA-Z]/);
  });
});
