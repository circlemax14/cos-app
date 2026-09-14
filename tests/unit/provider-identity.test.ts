import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalisePersonName, sameProvider } from '../../lib/provider-identity.ts';

/**
 * COS-1008 — the comparison that decides whether a provider's tabs have
 * anything in them.
 *
 * Before this, the screen compared a provider's printed name against the name
 * inside each clinical record. Those disagree by design, and the result was
 * measured: 3 of 76 reports and 1 of 19 encounter participants matched. The
 * tabs were empty because of a comma.
 */

test('a credential suffix does not make it a different person', () => {
  // The exact pair that broke it.
  assert.ok(sameProvider({ name: 'Riley Rowntree, MD' }, { name: 'Riley Rowntree' }));
  assert.ok(sameProvider({ name: 'Nurse Josephine M, RN' }, { name: 'Josephine M' }));
  assert.ok(sameProvider({ name: 'Hayley Do, PA' }, { name: 'Hayley Do' }));
});

test('an id match is authoritative and is checked first', () => {
  // Same person, names printed differently.
  assert.ok(sameProvider({ id: 'abc', name: 'A' }, { id: 'abc', name: 'Completely Different' }));
  // Two ids that genuinely differ must NOT be rescued by a name that matches:
  // the id branch returns outright rather than falling through.
  assert.equal(sameProvider({ id: 'abc', name: 'Same Name' }, { id: 'xyz', name: 'Same Name' }), false);
});

test('word boundaries — a credential list must not eat a surname', () => {
  /*
   * "Do" is a real surname and "pa" starts real names. A bare substring strip
   * would turn "Hayley Do" into "Hayley" and quietly match the wrong person.
   */
  assert.equal(normalisePersonName('Hayley Do, PA'), 'hayley do');
  assert.equal(normalisePersonName('Padma Dasari, MD'), 'padma dasari');
  assert.equal(normalisePersonName('Dorothy Otten, RN'), 'dorothy otten');
});

test('different people still do not match', () => {
  assert.equal(sameProvider({ name: 'Riley Rowntree, MD' }, { name: 'Morgan Bishop, MD' }), false);
});

test('an empty or unknown name never matches anything', () => {
  // Otherwise every record with no performer would attach to every provider.
  assert.equal(sameProvider({ name: '' }, { name: '' }), false);
  assert.equal(sameProvider({ name: undefined }, { name: undefined }), false);
  assert.equal(normalisePersonName(null), '');
  // "MD" alone normalises to nothing, so it cannot match another credential-only string.
  assert.equal(sameProvider({ name: 'MD' }, { name: 'RN' }), false);
});

test('punctuation and spacing differences are not a different person', () => {
  assert.ok(sameProvider({ name: 'Mary-Jane  O’Brien' }, { name: 'Mary Jane OBrien' }));
});
