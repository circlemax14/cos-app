#!/usr/bin/env node
/**
 * Runtime version drift guard (COS-356).
 *
 * Two checks:
 *
 *   1. ARTIFACT CONSISTENCY — all 5 iOS version artifacts declare the
 *      same version + build number. Per feedback_expo_plist_runtime_drift
 *      memory, the Expo "Configure-project" script has silently failed
 *      to sync these twice already, producing wrong-version archives.
 *      This check fails BEFORE any archive so drift never reaches
 *      TestFlight or the App Store.
 *
 *   2. NATIVE-DEP-VS-RUNTIME DRIFT — if package.json dependencies have
 *      been changed since the runtimeVersion was last touched (using
 *      git log), warn LOUDLY. The 2026-06-19 SCRUM-493 incident
 *      happened because PR #217 added expo-screen-capture without
 *      bumping runtimeVersion; publishing an OTA from that main would
 *      have crashed every existing binary on launch. Native deps ⇒
 *      binary cut ⇒ runtimeVersion bump — not OTA-eligible.
 *
 * Usage:
 *   node scripts/check-runtime-version.mjs           # strict — exits 1 on any issue
 *   node scripts/check-runtime-version.mjs --warn    # warnings only
 *
 * Invoked automatically by scripts/eas-update.sh before every OTA
 * publish. Can also be run manually before archiving.
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const WARN_ONLY = process.argv.includes('--warn');

function read(p) {
  return readFileSync(resolve(REPO_ROOT, p), 'utf8');
}

function grep(text, regex) {
  const m = text.match(regex);
  return m ? m[1] : null;
}

const problems = [];
const warnings = [];

// ── Check 1: all 5 iOS version artifacts agree ──────────────────────
const appJson = JSON.parse(read('app.json'));
const version = appJson.expo?.version;
const buildNumber = appJson.expo?.ios?.buildNumber;
const runtimeVersion = appJson.expo?.runtimeVersion;
const channel = appJson.expo?.updates?.requestHeaders?.['expo-channel-name'];

if (!version || !buildNumber || !runtimeVersion) {
  problems.push(
    `app.json missing required fields: version=${version}, buildNumber=${buildNumber}, runtimeVersion=${runtimeVersion}`,
  );
} else {
  const infoPlist = read('ios/CSH/Info.plist');
  const cfShortVersion = grep(infoPlist, /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/);
  const cfBundleVersion = grep(infoPlist, /<key>CFBundleVersion<\/key>\s*<string>([^<]+)<\/string>/);
  if (cfShortVersion !== version) {
    problems.push(`Info.plist CFBundleShortVersionString (${cfShortVersion}) ≠ app.json version (${version})`);
  }
  if (cfBundleVersion !== buildNumber) {
    problems.push(`Info.plist CFBundleVersion (${cfBundleVersion}) ≠ app.json ios.buildNumber (${buildNumber})`);
  }

  const expoPlist = read('ios/CSH/Supporting/Expo.plist');
  const expoRuntime = grep(expoPlist, /<key>EXUpdatesRuntimeVersion<\/key>\s*<string>([^<]+)<\/string>/);
  const expoChannel = grep(expoPlist, /<key>expo-channel-name<\/key>\s*<string>([^<]+)<\/string>/);
  if (expoRuntime !== runtimeVersion) {
    problems.push(`Expo.plist EXUpdatesRuntimeVersion (${expoRuntime}) ≠ app.json runtimeVersion (${runtimeVersion})`);
  }
  if (expoChannel !== channel) {
    problems.push(`Expo.plist expo-channel-name (${expoChannel}) ≠ app.json updates.requestHeaders (${channel})`);
  }

  const pbxproj = read('ios/CSH.xcodeproj/project.pbxproj');
  const marketingVersions = [...pbxproj.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1]);
  const currentProjectVersions = [...pbxproj.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map((m) => m[1]);
  if (!marketingVersions.every((v) => v === version)) {
    problems.push(`project.pbxproj MARKETING_VERSION mismatch: ${marketingVersions.join(', ')} ≠ ${version}`);
  }
  if (!currentProjectVersions.every((v) => v === buildNumber)) {
    problems.push(`project.pbxproj CURRENT_PROJECT_VERSION mismatch: ${currentProjectVersions.join(', ')} ≠ ${buildNumber}`);
  }
}

// ── Check 2: package.json changed but runtimeVersion frozen? ────────
// Uses git log to compare the most recent commit that touched
// package.json's dependencies vs the most recent one that touched
// app.json's runtimeVersion. If deps were changed AFTER the last
// runtimeVersion bump, warn — it may mean a native dep was added
// without bumping.
try {
  // execFileSync (not exec/execSync) — no shell involvement, no
  // metacharacter interpretation. This script takes no user input
  // today, but keeping the safer form as a durable default.
  const lastPkgCommit = execFileSync(
    'git',
    ['log', '-1', '--format=%ct', '--', 'package.json'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  ).trim();
  const lastRuntimeCommit = execFileSync(
    'git',
    ['log', '-1', '--format=%ct', '-S', 'runtimeVersion', '--', 'app.json'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  ).trim();

  if (lastPkgCommit && lastRuntimeCommit && Number(lastPkgCommit) > Number(lastRuntimeCommit)) {
    const daysBetween = Math.floor((Number(lastPkgCommit) - Number(lastRuntimeCommit)) / 86400);
    warnings.push(
      `package.json was modified ${daysBetween} day(s) after the last runtimeVersion change.\n` +
      `   If any of those changes added a NATIVE dependency (expo-*, react-native-*, or\n` +
      `   any package with iOS/Android native code), you MUST bump runtimeVersion and cut\n` +
      `   a new binary before publishing an OTA to this runtimeVersion. Publishing an OTA\n` +
      `   that references a missing native module will crash every user on the current\n` +
      `   binary — see SCRUM-493 (2026-06-19 incident) for the exact failure mode.\n` +
      `   To silence this warning once you've verified only JS deps changed, run:\n` +
      `     touch app.json && git commit -a -m "chore: runtime version verified"`,
    );
  }
} catch {
  // git not available or repo not initialized — silently skip this
  // check. Artifact consistency (check 1) is still enforced.
}

// ── Report ──────────────────────────────────────────────────────────
if (problems.length > 0) {
  console.error('❌ Runtime version guard: ARTIFACT MISMATCH\n');
  for (const p of problems) console.error(`   • ${p}`);
  console.error('\nAll 5 iOS version artifacts (app.json, Info.plist, Expo.plist,');
  console.error('project.pbxproj MARKETING_VERSION + CURRENT_PROJECT_VERSION) must');
  console.error('agree before archiving. The Expo Configure-project script has silently');
  console.error('failed to sync these twice — this guard prevents wrong-version archives.\n');
  if (!WARN_ONLY) process.exit(1);
}

if (warnings.length > 0) {
  console.warn('⚠️  Runtime version guard: WARNINGS\n');
  for (const w of warnings) console.warn(`   • ${w}\n`);
}

if (problems.length === 0 && warnings.length === 0) {
  console.log('✅ Runtime version guard: all 5 artifacts consistent, no drift detected.');
}
