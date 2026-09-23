#!/usr/bin/env bash
#
# COS-1037 — build a signed AAB for Google Play Internal Testing.
#
#   ./scripts/build-android-release.sh <prod|dev|staging> <version> [versionCode]
#
# WHY A SCRIPT AND NOT `./gradlew bundleRelease`
#
# Three things go wrong silently otherwise, and each one is only visible after
# upload — or worse, after testers are on it:
#
#   1. A DEBUG-SIGNED BUNDLE. build.gradle falls back to the debug key when
#      keystore.properties is absent, so a fresh clone builds happily and
#      produces an artifact Play rejects with an error that does not say why.
#      This script checks the actual signer and refuses.
#
#   2. THE WRONG ENVIRONMENT BAKED IN. EXPO_PUBLIC_* values are inlined into
#      the JS bundle at build time, so an AAB built with a dev .env talks to
#      dev forever, whatever the version says. prepare-build.sh sets the whole
#      set coherently; this calls it rather than trusting the tree.
#
#   3. A REUSED versionCode. Play refuses a duplicate, but only at upload,
#      after the whole build. Checked up front here.
#
# The applicationId is ai.circlesupporthealth.csh and LOCKS to the Play listing
# permanently on first upload. It is asserted below rather than assumed.
set -euo pipefail

ENVIRONMENT="${1:-}"
VERSION="${2:-}"
VERSION_CODE="${3:-}"

if [ -z "$ENVIRONMENT" ] || [ -z "$VERSION" ]; then
  echo "usage: $0 <prod|dev|staging> <version> [versionCode]" >&2
  exit 64
fi

cd "$(dirname "$0")/.."

# Android SDK — present on this machine but ANDROID_HOME is not exported.
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
[ -d "$ANDROID_HOME" ] || { echo "!! no Android SDK at $ANDROID_HOME" >&2; exit 1; }
# pod install's lesson, same shape: an unset locale breaks tooling in a way
# whose error message points somewhere else entirely.
export LANG="${LANG:-en_US.UTF-8}"

# ── 0. refuse to ship an Android build whose push is silently dead ─────────
#
# COS-1092. `expo-notifications` needs FCM credentials on Android — a
# google-services.json wired through app.json's `expo.android.googleServicesFile`.
# Neither exists yet.
#
# Without them the build succeeds, installs, runs, and every push notification
# is dropped on the floor with no error anywhere. That is the worst possible
# failure shape for a testing build: Krista would test for a week and report
# that notifications "don't seem to come through", and nothing in the logs
# would say why.
#
# So it is refused here, loudly, with the fix. Set ALLOW_NO_PUSH=1 to build
# anyway when you knowingly want a no-push build for something else.
if ! grep -q '"googleServicesFile"' app.json 2>/dev/null; then
  if [ "${ALLOW_NO_PUSH:-0}" != "1" ]; then
    cat >&2 <<'MSG'
!! Android push is NOT configured, so this build would silently drop every
   notification.

   expo-notifications requires FCM on Android. You need:

     1. A Firebase project for ai.circlesupporthealth.csh
     2. Download google-services.json into android/app/
     3. Add to app.json under expo.android:
          "googleServicesFile": "./android/app/google-services.json"

   google-services.json is NOT a secret in the usual sense, but it identifies
   the Firebase project — keep it out of screenshots and shared logs.

   To build a deliberately push-less AAB anyway:  ALLOW_NO_PUSH=1 $0 ...
MSG
    exit 1
  fi
  echo "!! ALLOW_NO_PUSH=1 — building with push DISABLED. Notifications will not arrive." >&2
fi

# ── 1. refuse to build unsigned ────────────────────────────────────────────
if [ ! -f android/keystore.properties ]; then
  cat >&2 <<'MSG'
!! android/keystore.properties is missing, so this build would be signed with
   the DEBUG key. Google Play rejects that, and the message it returns does not
   explain it.

   The file is gitignored on purpose. Recreate it as:

     storeFile=upload.keystore
     storePassword=<the password you saved>
     keyAlias=upload
     keyPassword=<the same password>
MSG
  exit 1
fi
[ -f android/app/upload.keystore ] || { echo "!! android/app/upload.keystore is missing." >&2; exit 1; }

# ── 2. set every version artifact + .env coherently ────────────────────────
echo "=== preparing $ENVIRONMENT $VERSION ==="
./scripts/prepare-build.sh "$ENVIRONMENT" "$VERSION" >/tmp/prep-android.log 2>&1 || {
  echo "!! prepare-build.sh failed:"; tail -20 /tmp/prep-android.log; exit 1; }
grep -E "^  (ok|FAIL)" /tmp/prep-android.log | sed 's/^/  /'

# ── 3. versionCode must be unique and must move forward ────────────────────
CURRENT_CODE=$(grep -E "^\s+versionCode" android/app/build.gradle | tr -dc '0-9')
if [ -n "$VERSION_CODE" ]; then
  if [ "$VERSION_CODE" -le "$CURRENT_CODE" ] 2>/dev/null; then
    echo "!! versionCode $VERSION_CODE is not greater than the current $CURRENT_CODE." >&2
    echo "   Play refuses a duplicate, but only AFTER the upload." >&2
    exit 1
  fi
  sed -i '' "s/versionCode $CURRENT_CODE/versionCode $VERSION_CODE/" android/app/build.gradle
  echo "  versionCode $CURRENT_CODE -> $VERSION_CODE"
else
  echo "  versionCode stays $CURRENT_CODE — pass one explicitly to bump it"
fi

# ── 4. the id that locks forever ───────────────────────────────────────────
APP_ID=$(grep -E "applicationId" android/app/build.gradle | head -1 | sed -E "s/.*'([^']+)'.*/\1/")
if [ "$APP_ID" != "ai.circlesupporthealth.csh" ]; then
  echo "!! applicationId is '$APP_ID', expected ai.circlesupporthealth.csh." >&2
  echo "   This LOCKS to the Play listing on first upload and cannot be changed." >&2
  exit 1
fi
echo "  applicationId $APP_ID"

# ── 5. build ───────────────────────────────────────────────────────────────
echo
echo "=== bundleRelease ==="
( cd android && ./gradlew bundleRelease --console=plain -q )

AAB=android/app/build/outputs/bundle/release/app-release.aab
[ -f "$AAB" ] || { echo "!! no AAB produced" >&2; exit 1; }

# ── 6. prove it is NOT debug-signed ────────────────────────────────────────
SIGNER=$(keytool -printcert -jarfile "$AAB" 2>/dev/null | grep -m1 "Owner:" || true)
echo
echo "  signer: ${SIGNER:-unknown}"
if echo "$SIGNER" | grep -qi "Android Debug"; then
  echo "!! this AAB is DEBUG-SIGNED. Play will reject it." >&2
  exit 1
fi

echo
echo "READY TO UPLOAD"
echo "  $AAB"
echo "  $(du -h "$AAB" | cut -f1)"
echo
echo "Play Console -> Testing -> Internal testing -> Create new release -> upload this file."
