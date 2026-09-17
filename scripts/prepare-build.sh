#!/bin/bash
#
# Prepare cos-app for an Xcode archive against ONE environment.
#
#   ./scripts/prepare-build.sh prod     <major 1.x>
#   ./scripts/prepare-build.sh dev      <major 2.x>
#   ./scripts/prepare-build.sh staging  <major 3.x>
#
# WHY THIS EXISTS
#
# A cos-app release touches SEVEN things that must agree, and they live in five
# different files plus a dotenv. Expo's "Configure project" run script is
# supposed to sync some of them from app.json and has silently failed twice —
# SCRUM-147 shipped a 1.3.0 binary whose Expo.plist still said 1.2.0 (so no OTA
# could ever reach it), and SCRUM-151 produced an archive labelled 1.2.0 (8)
# when app.json said 1.3.1. Both were found only after distribution.
#
# Doing this by hand three times per release, across three environments, is how
# that happens a third time. So: one command, one source of truth, and a
# verification pass that refuses to leave anything out of sync.
#
# THE VERSION-AS-ENVIRONMENT SCHEME (Vishal, 2026-08-19)
#
#   1.x.y = production     2.x.y = dev     3.x.y = staging
#
# The major version also becomes the runtimeVersion, which puts each
# environment in its own OTA lane: an update published at runtime 3.0.0 can
# only ever land on a staging build. Combined with the per-environment channel
# below, a prod OTA cannot reach a dev or staging binary even by mistake.
#
# ⚠️ ONE THING THIS SCRIPT CANNOT FIX: all three environments share the bundle
# identifier ai.circlesupporthealth.csh. They therefore CANNOT coexist on one
# device — installing staging replaces production — and they all map to the
# same App Store Connect record. See the note printed at the end.

set -euo pipefail

# CocoaPods needs a UTF-8 locale; LANG is unset on this machine and pod install
# dies with a Ruby Encoding::CompatibilityError before anything compiles.
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

ENVIRONMENT="${1:-}"
VERSION="${2:-}"
BUILD_NUMBER="${3:-}"

usage() {
  cat <<'USAGE'
Usage: ./scripts/prepare-build.sh <prod|dev|staging> <version> [buildNumber]

  prod     -> .env.prod     channel: production   version should be 1.x.y
  dev      -> .env.dev      channel: development  version should be 2.x.y
  staging  -> .env.staging  channel: preview      version should be 3.x.y

  buildNumber defaults to current + 1.

Examples:
  ./scripts/prepare-build.sh staging 3.0.0
  ./scripts/prepare-build.sh prod    1.5.3 64
USAGE
  exit 1
}

[ -z "$ENVIRONMENT" ] && usage
[ -z "$VERSION" ] && usage

case "$ENVIRONMENT" in
  prod)    ENV_FILE=".env.prod";    CHANNEL="production";  EXPECTED_MAJOR=1 ;;
  dev)     ENV_FILE=".env.dev";     CHANNEL="development"; EXPECTED_MAJOR=2 ;;
  staging) ENV_FILE=".env.staging"; CHANNEL="preview";     EXPECTED_MAJOR=3 ;;
  *) echo "!! unknown environment '$ENVIRONMENT'"; usage ;;
esac

[ -f "$ENV_FILE" ] || { echo "!! $ENV_FILE not found"; exit 1; }

MAJOR="${VERSION%%.*}"
if [ "$MAJOR" != "$EXPECTED_MAJOR" ]; then
  echo "!! version $VERSION has major $MAJOR but $ENVIRONMENT expects ${EXPECTED_MAJOR}.x.y"
  echo "   The major version IS the environment marker and the OTA lane."
  echo "   Pass the right version, or change the scheme deliberately."
  exit 1
fi

CURRENT_BUILD=$(grep '"buildNumber"' app.json | tr -dc '0-9')
if [ -z "$BUILD_NUMBER" ]; then
  BUILD_NUMBER=$((CURRENT_BUILD + 1))
fi

echo "════════════════════════════════════════════════════════════"
echo "  environment : $ENVIRONMENT"
echo "  version     : $VERSION  (build $BUILD_NUMBER, was $CURRENT_BUILD)"
echo "  runtime     : $VERSION"
echo "  OTA channel : $CHANNEL"
echo "  env file    : $ENV_FILE"
echo "════════════════════════════════════════════════════════════"
echo

# ── 0. PHI capture policy, checked BEFORE anything is written ───────────────
#
# COS-1034 (2026-09-17). Screen capture is now ALLOWED by product decision, so
# a prod build with SCREENSHOTS_BLOCKED = false is EXPECTED and must not fail.
#
# The guard is inverted rather than deleted. Its job was never "false is
# forbidden" — it was that this value must always be the one somebody DECIDED.
# COS-905 records what the absence of that costs: flipped false on 2026-06-26
# for screenshot testing, never flipped back, ten weeks on main through every
# build and OTA with capture protection off for every patient.
#
# So a prod build now WARNS if the constant has gone back to `true`, because
# that would silently re-block capture for patients who have been able to save
# their own records — the same class of drift in the other direction. It warns
# rather than refuses: restoring protection is a safe direction to fail in, and
# counsel or Apple may well require it.
POLICY_FILE="lib/screenshot-policy.ts"
if grep -q '^export const SCREENSHOTS_BLOCKED = true;' "$POLICY_FILE" 2>/dev/null; then
  if [ "$ENVIRONMENT" = "prod" ]; then
    echo "!! $POLICY_FILE has SCREENSHOTS_BLOCKED = true."
    echo "   Capture protection is ON, which REVERSES the COS-1034 decision that"
    echo "   patients may screenshot their own records. If that reversal is"
    echo "   deliberate, say so in the commit and in screenshot-policy.ts."
    echo "   Continuing — restoring a PHI safeguard is a safe direction to fail in."
  fi
fi

# ── 1. dotenv ───────────────────────────────────────────────────────────────
cp "$ENV_FILE" .env
echo "[1/7] .env <- $ENV_FILE"
grep '^EXPO_PUBLIC_API_BASE_URL' .env | sed 's/^/       /'

# ── 2..5. the five version artifacts ────────────────────────────────────────
python3 - "$VERSION" "$BUILD_NUMBER" "$CHANNEL" <<'PY'
import re, sys
version, build, channel = sys.argv[1], sys.argv[2], sys.argv[3]

# app.json
#
# The channel here is NOT cosmetic. Expo's "Configure project" run script
# regenerates ios/CSH/Supporting/Expo.plist FROM app.json during xcodebuild —
# i.e. AFTER this script has finished verifying. Setting the channel only in
# the plist would therefore be silently reverted at archive time, which is
# exactly how SCRUM-147 shipped a binary whose plist disagreed with app.json.
# Both must be written.
p='app.json'; s=open(p).read()
s=re.sub(r'("version":\s*")[^"]+(")',            rf'\g<1>{version}\g<2>', s, count=1)
s=re.sub(r'("buildNumber":\s*")[^"]+(")',        rf'\g<1>{build}\g<2>',   s, count=1)
s=re.sub(r'("runtimeVersion":\s*")[^"]+(")',     rf'\g<1>{version}\g<2>', s, count=1)
s=re.sub(r'("expo-channel-name":\s*")[^"]+(")',  rf'\g<1>{channel}\g<2>', s, count=1)
open(p,'w').write(s); print(f"[2/7] app.json        version {version}, build {build}, runtime {version}, channel {channel}")

# Expo.plist — EXUpdatesRuntimeVersion is what expo-updates reads at RUNTIME,
# not app.json. This is the field that silently drifted in SCRUM-147.
p='ios/CSH/Supporting/Expo.plist'; s=open(p).read()
s=re.sub(r'(<key>EXUpdatesRuntimeVersion</key>\s*\n\s*<string>)[^<]+(</string>)', rf'\g<1>{version}\g<2>', s)
s=re.sub(r'(<key>expo-channel-name</key>\s*\n\s*<string>)[^<]+(</string>)',       rf'\g<1>{channel}\g<2>', s)
open(p,'w').write(s); print(f"[3/7] Expo.plist      runtime {version}, channel {channel}")

# project.pbxproj — both Debug and Release configurations
p='ios/CSH.xcodeproj/project.pbxproj'; s=open(p).read()
n1=len(re.findall(r'MARKETING_VERSION = [^;]+;', s))
n2=len(re.findall(r'CURRENT_PROJECT_VERSION = [^;]+;', s))
s=re.sub(r'MARKETING_VERSION = [^;]+;',       f'MARKETING_VERSION = {version};', s)
s=re.sub(r'CURRENT_PROJECT_VERSION = [^;]+;', f'CURRENT_PROJECT_VERSION = {build};', s)
open(p,'w').write(s); print(f"[4/7] project.pbxproj MARKETING x{n1}, CURRENT x{n2}")

# Info.plist — what App Store / TestFlight display
p='ios/CSH/Info.plist'; s=open(p).read()
s=re.sub(r'(<key>CFBundleShortVersionString</key>\s*\n\s*<string>)[^<]+(</string>)', rf'\g<1>{version}\g<2>', s)
s=re.sub(r'(<key>CFBundleVersion</key>\s*\n\s*<string>)[^<]+(</string>)',            rf'\g<1>{build}\g<2>',   s)
open(p,'w').write(s); print(f"[5/7] Info.plist      {version} ({build})")

# android/ — three stamps, and they matter for exactly the same reasons as the
# iOS four. The committed android/ tree is generated by `expo prebuild`, but it
# is CHECKED IN, so whatever is committed is what Gradle builds: prebuild is not
# re-run on a normal build and never on a colleague's machine.
#
# This script shipped without them and six commits (COS-932..938) went to the
# branch stamped 2.1.0/development on Android while iOS read 1.5.2/production —
# the two platforms disagreeing about which backend the app talks to.
import os
if os.path.isdir('android'):
    p='android/app/build.gradle'; s=open(p).read()
    s=re.sub(r'versionName "[^"]+"', f'versionName "{version}"', s)
    open(p,'w').write(s)

    # What expo-updates reads at RUNTIME on Android — the strings.xml twin of
    # EXUpdatesRuntimeVersion. Drift here means no OTA can ever reach the build.
    p='android/app/src/main/res/values/strings.xml'; s=open(p).read()
    s=re.sub(r'(<string name="expo_runtime_version">)[^<]+(</string>)', rf'\g<1>{version}\g<2>', s)
    open(p,'w').write(s)

    # The channel lives inside a JSON blob in an XML attribute, so it is
    # HTML-escaped: {"expo-channel-name":"production"} with &quot; for every
    # quote. Writing a bare quote here produces a manifest that does not parse.
    p='android/app/src/main/AndroidManifest.xml'; s=open(p).read()
    s=re.sub(r'(UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY" android:value="\{&quot;expo-channel-name&quot;:&quot;)[^&]+(&quot;\})',
             rf'\g<1>{channel}\g<2>', s)
    open(p,'w').write(s)
    print(f"[6/7] android/        versionName {version}, runtime {version}, channel {channel}")
else:
    print("[6/7] android/        absent - skipped (run `expo prebuild -p android`)")
PY

# ── 6. pods, then RE-VERIFY (pod install has reverted Expo.plist before) ─────
echo "[7/7] pod install…"
( cd ios && pod install >/dev/null 2>&1 ) && echo "       pods ok"

echo
echo "──────────── VERIFICATION (post pod-install) ────────────"
FAIL=0
check() { # label expected actual
  if [ "$2" = "$3" ]; then printf "  ok   %-34s %s\n" "$1" "$3"
  else printf "  FAIL %-34s got '%s' want '%s'\n" "$1" "$3" "$2"; FAIL=1; fi
}
check "app.json version"        "$VERSION"      "$(grep '"version"' app.json | head -1 | sed 's/.*: *"//;s/".*//')"
check "app.json buildNumber"    "$BUILD_NUMBER" "$(grep '"buildNumber"' app.json | sed 's/.*: *"//;s/".*//')"
check "app.json runtimeVersion" "$VERSION"      "$(grep '"runtimeVersion"' app.json | sed 's/.*: *"//;s/".*//')"
# app.json's channel is what the Expo run script rebuilds the plist from at
# ARCHIVE time — if this disagrees with the plist, the plist loses.
check "app.json channel"        "$CHANNEL"      "$(grep '"expo-channel-name"' app.json | sed 's/.*: *"//;s/".*//')"
check "Expo.plist runtime"      "$VERSION"      "$(grep -A1 EXUpdatesRuntimeVersion ios/CSH/Supporting/Expo.plist | tail -1 | sed 's/.*<string>//;s/<.*//')"
check "Expo.plist channel"      "$CHANNEL"      "$(grep -A1 'expo-channel-name' ios/CSH/Supporting/Expo.plist | tail -1 | sed 's/.*<string>//;s/<.*//')"
check "pbxproj MARKETING"       "$VERSION"      "$(grep 'MARKETING_VERSION' ios/CSH.xcodeproj/project.pbxproj | sed 's/.*= //;s/;//' | sort -u | tr -d ' ')"
check "pbxproj CURRENT"         "$BUILD_NUMBER" "$(grep 'CURRENT_PROJECT_VERSION' ios/CSH.xcodeproj/project.pbxproj | sed 's/.*= //;s/;//' | sort -u | tr -d ' ')"
check "Info.plist short"        "$VERSION"      "$(grep -A1 CFBundleShortVersionString ios/CSH/Info.plist | tail -1 | sed 's/.*<string>//;s/<.*//')"
check "Info.plist bundle"       "$BUILD_NUMBER" "$(grep -A1 '<key>CFBundleVersion<' ios/CSH/Info.plist | tail -1 | sed 's/.*<string>//;s/<.*//')"
if [ -d android ]; then
  check "gradle versionName"    "$VERSION" "$(grep -m1 'versionName' android/app/build.gradle | sed 's/.*"\(.*\)"/\1/')"
  check "android OTA runtime"   "$VERSION" "$(grep 'expo_runtime_version' android/app/src/main/res/values/strings.xml | sed 's/.*>\(.*\)<.*/\1/')"
  check "android OTA channel"   "$CHANNEL" "$(grep 'REQUEST_HEADERS_KEY' android/app/src/main/AndroidManifest.xml | sed 's/.*expo-channel-name&quot;:&quot;\([^&]*\)&quot.*/\1/')"
fi
EXPECTED_API=$(grep '^EXPO_PUBLIC_API_BASE_URL' "$ENV_FILE" | cut -d= -f2-)
check ".env API base"           "$EXPECTED_API" "$(grep '^EXPO_PUBLIC_API_BASE_URL' .env | cut -d= -f2-)"
echo "─────────────────────────────────────────────────────────"

if [ "$FAIL" -ne 0 ]; then
  echo
  echo "!! SOMETHING IS OUT OF SYNC — do not archive."
  echo "   This is the exact failure mode of SCRUM-147 / SCRUM-151."
  exit 1
fi

echo
echo "READY TO ARCHIVE — $ENVIRONMENT $VERSION ($BUILD_NUMBER)"
echo "  Xcode: scheme CSH -> Any iOS Device (arm64) -> Product > Archive"
echo "  open ios/CSH.xcworkspace"
echo
if [ "$ENVIRONMENT" != "prod" ]; then
cat <<WARN
  ⚠️  .env currently points at $ENVIRONMENT. It is inlined into every JS bundle.
      RUN THIS AFTER ARCHIVING, before any eas update:
          ./scripts/prepare-build.sh prod <version>
      or at minimum:  cp .env.prod .env
WARN
fi
cat <<'NOTE'

  ⚠️  ALL THREE ENVIRONMENTS SHARE ONE BUNDLE ID (ai.circlesupporthealth.csh).
      They cannot coexist on a device - installing one REPLACES the others -
      and they all upload to the same App Store Connect record. To run them
      side by side you need separate bundle ids per environment, which also
      requires new App IDs, provisioning profiles, push keys and NEW GOOGLE
      OAuth iOS client ids (those are bundle-id scoped - Google Sign-In breaks
      otherwise). That is Apple-portal work, not a code change.
NOTE
