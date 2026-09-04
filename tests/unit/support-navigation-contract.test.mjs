/**
 * The four Help & Support defects Vishal reported on 2026-09-04, held as
 * source-level contracts. Each one was invisible to tsc, to eslint and to
 * every existing test — they are agreements BETWEEN two files, and nothing
 * type-checks the space between two files.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

/**
 * Source with comments removed.
 *
 * Every assertion below greps for code. Prose that NAMES a pattern is not a
 * use of it, and a test that cannot tell the two apart fails on its own
 * explanation — which is exactly what the COS-802 `href: null` test did, and
 * what two assertions in this file did before this helper existed. Strip once,
 * grep the rest.
 */
const code = (p) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const support = code('app/Home/support.tsx')
const detail = code('app/Home/support-ticket-detail.tsx')
const profile = code('components/profile-content.tsx')
const wrapper = code('components/app-wrapper.tsx')

// ── COS-886: the param the list sends is the param the screen reads ─────────
//
// support.tsx pushed `{ id }`; support-ticket-detail.tsx reads `ticketId`. It
// resolved to '', useSupportTicket is `enabled: ticketId !== ''`, so no request
// was ever made and every row rendered "We could not open this request."
// Nothing threw. This is the test that would have caught it.

test('THE POINT: the list pushes the param name the detail screen reads', () => {
  const push = support.match(/router\.push\(\{\s*pathname: '\/Home\/support-ticket-detail',\s*params: \{([^}]*)\}/)
  assert.ok(push, 'support.tsx must push the detail route with params')
  const sent = push[1]
  assert.match(sent, /\bticketId\b/, 'the detail screen reads params.ticketId')
  assert.doesNotMatch(sent, /\bid:/, 'sending `id:` is the COS-886 bug')
})

test('the detail screen still accepts `id` as well, so an old link is not a dead end', () => {
  assert.match(detail, /params\.ticketId \?\? params\.id/)
})

test('a ticket query is only enabled for a non-empty id — the silent-failure guard', () => {
  const hook = code('hooks/use-support-tickets.ts')
  assert.match(hook, /enabled: ticketId !== ''/)
})

// ── COS-886: back goes to Help & Support, not Home ──────────────────────────
//
// These screens sit in a Tabs navigator and @react-navigation/routers defaults
// TabRouter to `backBehavior: 'firstRoute'`. GO_BACK there means the FIRST
// route — `index`, i.e. Home — not the screen you came from.

test('THE POINT: back from a ticket names its destination instead of calling back()', () => {
  const back = detail.match(/accessibilityLabel="Go back to your requests"/)
  assert.ok(back, 'the back control must still exist')
  assert.match(detail, /router\.navigate\('\/Home\/support'/)
  assert.doesNotMatch(
    detail,
    /onPress=\{\(\) => router\.back\(\)\}/,
    'router.back() in a Tabs navigator lands on Home (backBehavior: firstRoute)',
  )
})

// ── COS-885: the drawer closes before it navigates ─────────────────────────
//
// Thirteen rows in ProfileContent called router.push() directly. The drawer is
// `{isDrawerMenuVisible && ...}` inside the screen that opened it, so the flag
// stayed true and the drawer was still open on return.

test('THE POINT: no row in the drawer navigates without closing it first', () => {
  // go() holds the ONE legitimate router.push. Any push naming a route
  // literal is a row that skipped it.
  const bare = profile.split('\n').filter((l) => /router\.push\(['"`]/.test(l))
  assert.deepEqual(bare, [], 'every /Home push must go through go(), which calls onNavigate first')

  const pushes = profile.match(/router\.push\(/g) ?? []
  assert.equal(pushes.length, 1, 'go() is the only place this file pushes from')
})

test('go() closes before it pushes — order is the whole fix', () => {
  const body = profile.match(/const go = \(path: string\): void => \{([\s\S]*?)\n  \};/)
  assert.ok(body, 'ProfileContent must funnel navigation through go()')
  const close = body[1].indexOf('onNavigate?.()')
  const push = body[1].indexOf('router.push')
  assert.ok(close > -1 && push > -1, 'go() must both close and push')
  assert.ok(close < push, 'closing AFTER the push is the bug that was just fixed')
})

test('AppWrapper hands the drawer its closer', () => {
  assert.match(wrapper, /onNavigate=\{closeDrawerMenu\}/)
})

// ── COS-887: only an ELECTED agency gets the routing question ──────────────
//
// ensureUserProfile stamps every new PATIENT with the isDefault agency, so
// `Boolean(agencyId)` was true for patients who have no agency at all.

test('THE POINT: the routing choice keys off hasElectedAgency, never agencyId', () => {
  assert.match(code('hooks/use-user.ts'), /hasElectedAgency\?: boolean/)
  assert.match(support, /user\?\.hasElectedAgency === true/)
  assert.doesNotMatch(
    support,
    /const hasAgency = Boolean\(\(user as \{ agencyId/,
    'agencyId is set for every patient by the default-agency stamp',
  )
})

test('no agency still means the destination is CSH, with no control shown', () => {
  assert.match(support, /hasAgency \? \(routedTo \?\? 'CSH'\) : 'CSH'/)
  assert.match(support, /canContactSupport && hasAgency && \(/)
})

// ── COS-888: the screen is blocked while the request is in flight ──────────

test('THE POINT: a modal blocks the whole screen while submitting', () => {
  assert.match(support, /<Modal\s+visible=\{createTicket\.isPending\}/)
  assert.match(support, /onRequestClose=\{\(\) => \{\}\}/, 'back must not dismiss an in-flight send')
})

test('the blocking overlay adds no new react-native primitive beyond Modal', () => {
  // Read the IMPORT LIST, not the file: a comment that NAMES a primitive is
  // not a use of one, and grepping the whole file made this test fail on its
  // own explanation.
  const imports = support.match(/import \{([\s\S]*?)\} from 'react-native';/)
  assert.ok(imports, 'support.tsx imports from react-native')
  const named = imports[1].split(',').map((x) => x.trim()).filter(Boolean)
  assert.deepEqual(named, [
    'Alert', 'KeyboardAvoidingView', 'Modal', 'Platform', 'ScrollView',
    'StyleSheet', 'Text', 'TextInput', 'TouchableOpacity', 'View',
  ], 'iOS 26 cold-mount envelope: no ActivityIndicator, no Animated')
})

// ── COS-889: the description cap, and a subject that means something ───────

test('THE POINT: typing stops at the cap the SERVER enforces', () => {
  // A cap the app invents is a restriction; a cap below the server's lets a
  // patient write a long account and lose it to a 400. maxLength (not a
  // validate-on-submit check) is what makes the 4001st character impossible.
  assert.match(support, /const MAX_DESCRIPTION_LENGTH = 4000/)
  assert.match(support, /maxLength=\{MAX_DESCRIPTION_LENGTH\}/)
})

test('the app cap and the server cap are the same number', () => {
  const server = readFileSync(
    new URL('../../../cos-backend/src/routes/support-tickets.routes.ts', import.meta.url),
    'utf8',
  )
  const zod = server.match(/description: z\.string\(\)\.trim\(\)\.min\(1\)\.max\((\d+)\)/)
  assert.ok(zod, 'the server must still cap description')
  const app = support.match(/const MAX_DESCRIPTION_LENGTH = (\d+)/)
  assert.equal(app[1], zod[1], 'app cap drifted from the server cap')
})

test('the count is on screen BEFORE the limit is reached, not only at it', () => {
  // maxLength alone just makes the keyboard go dead with no explanation.
  assert.match(support, /characters left/)
  assert.match(support, /Character limit reached/)
})

test('the reply box on the ticket screen caps and counts the same way', () => {
  assert.match(detail, /maxLength=\{MAX_REPLY_LENGTH\}/)
  assert.match(detail, /characters left/)
})

test('THE POINT: the subject is the patient\'s own words, not a constant', () => {
  // It was the literal 'Support Request' on every ticket, so "Your requests"
  // was a column of identical rows and so was the admin queue.
  assert.doesNotMatch(support, /subject: 'Support Request'/)
  assert.match(support, /const firstLine = description\.trim\(\)\.split/)
  assert.match(support, /subject,/)
})

test('the derived subject cannot fail the server\'s 120-character limit', () => {
  const server = readFileSync(
    new URL('../../../cos-backend/src/routes/support-tickets.routes.ts', import.meta.url),
    'utf8',
  )
  const cap = Number(server.match(/subject: z\.string\(\)\.trim\(\)\.min\(1\)\.max\((\d+)\)/)[1])
  const truncate = Number(support.match(/firstLine\.length > (\d+)/)[1])
  assert.ok(truncate < cap, `truncating at ${truncate} must stay under the server's ${cap}`)
})
