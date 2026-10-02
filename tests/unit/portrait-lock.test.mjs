import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const plist = readFileSync(join(ROOT, 'ios/CSH/Info.plist'), 'utf8');

/*
 * COS-1238. The clinical lead was locked out of the app for two days because his
 * iPad rotated the PIN screen into landscape, where the number pad and
 * "Forgot PIN?" fell below the fold.
 *
 * THE TRAP THIS PINS: `expo.orientation: "portrait"` has been set in app.json the
 * whole time, and it does NOTHING here. This is a BARE workflow — ios/ is
 * committed and `expo prebuild` never runs — so Info.plist is the only file that
 * decides. Setting `ios.requireFullScreen` in app.json looks like the fix, builds
 * cleanly, and changes nothing.
 */
const ipadBlock = plist.split('UISupportedInterfaceOrientations~ipad')[1] ?? '';
const ipadArray = ipadBlock.slice(0, ipadBlock.indexOf('</array>'));

test('COS-1238: the iPad is portrait-only in the file that actually decides', () => {
  assert.ok(ipadArray.includes('UIInterfaceOrientationPortrait'), 'portrait must be allowed');
  assert.ok(
    !ipadArray.includes('UIInterfaceOrientationLandscapeLeft') &&
      !ipadArray.includes('UIInterfaceOrientationLandscapeRight'),
    'landscape on iPad is what put the PIN pad below the fold',
  );
});

test('COS-1238: UIRequiresFullScreen is true, or iOS ignores the lock entirely', () => {
  const idx = plist.indexOf('UIRequiresFullScreen');
  assert.ok(idx > -1, 'the key must be present');
  assert.match(
    plist.slice(idx, idx + 120),
    /<true\/>/,
    'an iPad app that supports multitasking MUST support all four orientations — ' +
      'with this false, the portrait arrays above are ignored',
  );
});
