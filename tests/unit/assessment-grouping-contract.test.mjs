/**
 * Health Trends groups self-assessments by the REAL biopsychosocial taxonomy.
 *
 * Ken 2026-08-14: "the self-assessments by biopsychosocial."
 *
 * lib/assessment-grouping.test.mjs proves the grouping logic, but it feeds in
 * its own small copy of the subdomain→domain map, because the module takes the
 * resolver as a parameter (it has to: `node --test` resolves neither the '@/'
 * alias nor an extensionless relative TS import). That leaves exactly one
 * thing unproven, and it is the thing most likely to rot — that the screen
 * passes the real taxonomy rather than a stand-in.
 *
 * The other half is the backend join. Every one of the 23 system instruments
 * already carries `subdomains`; the app only ever sees them because the
 * assessments list route attaches them. If that join is removed, this feature
 * silently degrades to a flat list — so it is asserted here too.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const SCREEN = read('components/health-plan/SelfAssessmentTrends.tsx');
const API = read('services/api/assessments.ts');
const TAXONOMY = read('lib/bps-subdomains.ts');

const codeOnly = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the screen resolves domains through lib/bps-subdomains, not a local map', () => {
  const code = codeOnly(SCREEN);
  assert.match(code, /import \{ getSubdomain \} from '@\/lib\/bps-subdomains'/);
  assert.match(
    code,
    /groupAssessmentsByDomain\(\s*records,\s*\(key\) => getSubdomain\(key\)\?\.domain \?\? null\s*\)/,
    'the resolver passed in must be the real taxonomy lookup',
  );
});

test('the three domain labels the screen can render all exist in the taxonomy', () => {
  // groupAssessmentsByDomain keys its DOMAIN_ORDER off these exact strings. A
  // rename in bps-subdomains.ts would not fail typecheck through the injected
  // resolver — it would just silently push every card into "Other".
  const GROUPING = read('lib/assessment-grouping.ts');
  const declared = [...codeOnly(GROUPING).matchAll(/domain: '([a-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual(declared, ['biological', 'psychological', 'social']);
  for (const d of declared) {
    assert.match(
      codeOnly(TAXONOMY),
      new RegExp(`domain: '${d}'`),
      `'${d}' must be a domain the taxonomy actually assigns`,
    );
  }
});

test('a backend with no subdomain join still renders the old flat carousel', () => {
  // The client half ships before the backend join reaches production, and
  // older app builds keep talking to it afterwards. Neither may show a lone
  // "Other" heading over every card.
  const code = codeOnly(SCREEN);
  assert.match(
    code,
    /if \(groups\.length === 1 && groups\[0\]\.domain === null\) \{/,
    'the unplaceable case must short-circuit to the ungrouped render',
  );
});

test('the record type admits the field the backend joins on', () => {
  assert.match(codeOnly(API), /subdomains\?: string\[\]/);
});

test('the backend still joins subdomains onto the assessments list', () => {
  // Lives in the sibling repo, so this is a soft check — skipped rather than
  // failed when cos-backend is not checked out beside cos-app.
  let route;
  try {
    route = readFileSync(join(ROOT, '..', 'cos-backend/src/routes/assessments.routes.ts'), 'utf8');
  } catch {
    return; // cos-backend not present; the app-side assertions above still hold
  }
  const code = codeOnly(route);
  assert.match(code, /listInstrumentsForOwner\('system'\)/);
  assert.match(code, /subdomainsById/);
  assert.match(
    code,
    /\{ \.\.\.r, subdomains: subs \}/,
    'each record must be enriched with its instrument subdomains',
  );
});
