/**
 * COS-722 — a patch that never executes is worse than no patch, because it
 * reads as protection that isn't there.
 *
 * WHAT HAPPENED
 * `patches/react-native-paper-tabs+0.11.4.patch` (commit 91b47bf, "fix: resolve
 * tab label clipping for long subcategory names") patched ONLY
 * `node_modules/react-native-paper-tabs/src/TabsHeaderItem.tsx`.
 *
 * But that package's entry points are:
 *     main   = ./lib/commonjs/index.js
 *     module = ./lib/module/index.js
 *     source = ./src/index.tsx          <-- what the patch edited
 *
 * Metro's default `resolverMainFields` is ['react-native', 'browser', 'main'].
 * `source` is NOT in that list, and this repo has no metro.config.js adding it.
 * So Metro loaded lib/commonjs/*, the patch edited src/*, and the fix never ran
 * in any build — for roughly as long as the patch has existed. The clipping bug
 * it claimed to fix stayed live for anyone using a larger accessibility text
 * size (app/modal.tsx scales tab labels via getScaledFontSize).
 *
 * WHY A TEST
 * Nothing failed. patch-package reported success, CI was green, tsc was green,
 * and the patch file looked correct in review. The only observable was a visual
 * bug nobody connected back to it. This test makes the failure loud.
 *
 * THE INVARIANT
 * If a patch edits a package's `source` tree, it must ALSO edit the built output
 * that `main`/`module` point at — otherwise the edit is dead on arrival.
 *
 * Patches against NATIVE files (.h/.m/.mm/.java/.kt, ios/, android/) are exempt:
 * those are consumed by Xcode/CocoaPods/Gradle at compile time, so JS entry-point
 * resolution does not apply to them. Both patches/expo+*.patch and
 * patches/react-native+*.patch are of that kind.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PATCH_DIR = join(ROOT, 'patches');
const MODULES = join(ROOT, 'node_modules');

const NATIVE_EXT = /\.(h|m|mm|c|cpp|swift|java|kt|kts|gradle|pbxproj|plist|rb)$/i;
const NATIVE_DIR = /^(ios|android|Libraries\/AppDelegate)\//i;

type Target = { pkg: string; rel: string };

/** Every `node_modules/<pkg>/<rel>` path a patch file touches. */
function targetsOf(patchText: string): Target[] {
  const out: Target[] = [];
  for (const line of patchText.split('\n')) {
    const m = /^diff --git a\/node_modules\/(.+?) b\/node_modules\//.exec(line);
    if (!m) continue;
    const full = m[1];
    const parts = full.split('/');
    const pkg = full.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
    out.push({ pkg, rel: full.slice(pkg.length + 1) });
  }
  return out;
}

function isNative(rel: string): boolean {
  return NATIVE_EXT.test(rel) || NATIVE_DIR.test(rel);
}

/** Top-level directory of an entry-point field, e.g. './lib/commonjs/index.js' -> 'lib'. */
function entryDir(entry: string | undefined): string | null {
  if (!entry) return null;
  const cleaned = entry.replace(/^\.\//, '');
  const first = cleaned.split('/')[0];
  return first && first.includes('.') ? null : first;
}

const patchFiles = existsSync(PATCH_DIR)
  ? readdirSync(PATCH_DIR).filter((f) => f.endsWith('.patch'))
  : [];

test('there is at least one patch to check (guard against a silently empty suite)', () => {
  assert.ok(patchFiles.length > 0, 'no .patch files found under patches/');
});

for (const patchFile of patchFiles) {
  const patchText = readFileSync(join(PATCH_DIR, patchFile), 'utf8');
  const targets = targetsOf(patchText);

  test(`${patchFile}: every patched file exists on disk`, () => {
    assert.ok(targets.length > 0, `parsed no targets out of ${patchFile}`);
    for (const t of targets) {
      const p = join(MODULES, t.pkg, t.rel);
      assert.ok(existsSync(p), `${patchFile} patches ${t.pkg}/${t.rel}, which does not exist. ` +
        `Run \`npx patch-package\` (the postinstall step) or the patch is stale.`);
    }
  });

  test(`${patchFile}: JS edits reach the package entry point, not just its source tree`, () => {
    const jsTargets = targets.filter((t) => !isNative(t.rel));
    if (jsTargets.length === 0) return; // native-only patch — exempt, see docblock

    const byPkg = new Map<string, string[]>();
    for (const t of jsTargets) {
      if (!byPkg.has(t.pkg)) byPkg.set(t.pkg, []);
      byPkg.get(t.pkg)!.push(t.rel);
    }

    for (const [pkg, rels] of byPkg) {
      const pkgJsonPath = join(MODULES, pkg, 'package.json');
      if (!existsSync(pkgJsonPath)) continue;
      const meta = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as Record<string, string>;

      // Metro's default resolverMainFields; `source` is deliberately excluded
      // because this repo has no metro.config.js that re-adds it.
      const runtimeDirs = [
        entryDir(meta['react-native']),
        entryDir(meta.main),
        entryDir(meta.module),
      ].filter((d): d is string => Boolean(d));

      if (runtimeDirs.length === 0) continue; // flat package — every file is reachable

      const touched = new Set(rels.map((r) => r.split('/')[0]));
      const reachesRuntime = runtimeDirs.some((d) => touched.has(d));

      assert.ok(
        reachesRuntime,
        `${patchFile} edits ${pkg} at [${[...touched].join(', ')}] but Metro loads from ` +
          `[${[...new Set(runtimeDirs)].join(', ')}] (main=${meta.main ?? '-'}, ` +
          `module=${meta.module ?? '-'}, source=${meta.source ?? '-'}). ` +
          `The patch will NOT run. Apply the same edit to the built output and ` +
          `regenerate with \`npx patch-package ${pkg}\`.`,
      );
    }
  });
}
