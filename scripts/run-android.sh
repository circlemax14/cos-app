#!/bin/bash
#
# Build and run cos-app on an Android device against ONE environment.
#
#   ./scripts/run-android.sh dev              (default — 2.1.0)
#   ./scripts/run-android.sh dev 2.1.0
#   ./scripts/run-android.sh staging 3.0.0
#   ./scripts/run-android.sh prod 1.5.2 --i-mean-it
#
# ─── THE MAJOR VERSION IS THE ENVIRONMENT, ON ANDROID TOO ────────────
#
# 1.x = prod / channel `production`, 2.x = dev / `development`,
# 3.x = staging / `preview`. See cos-app/CLAUDE.md.
#
# The first version of this script swapped only the DOTENV, which was half a
# guard. `expo prebuild` had stamped android/ from an app.json that was sitting
# at prod 1.5.2, so the APK declared:
#
#     expo_runtime_version = 1.5.2
#     expo-channel-name    = production
#
# i.e. a debug handset subscribed to the PRODUCTION OTA lane, at the exact
# runtime live iPhone users are on — while its JS pointed at dev. The two
# halves of the build disagreed about which environment it was.
#
# So the stage now drives BOTH: prepare-build.sh sets app.json + .env, and a
# prebuild propagates that into android/. Same source of truth as iOS, same
# rule that a major version cannot contradict its environment.
#
# ─── WHY THIS EXISTS ─────────────────────────────────────────────────
#
# `expo run:android` inlines `.env` into the JS bundle at build time, exactly
# as the iOS build does. The repo's `.env` is kept pointing at PRODUCTION,
# because `scripts/prepare-build.sh` restores it that way after every dev OTA
# so main stays archivable for the App Store.
#
# So `npm run android` with no wrapper produced a DEBUG APK, signed with the
# checked-in debug keystore, on an unmanaged handset, reading real patient PHI
# from the production API and the production Cognito pool. Nothing warned. The
# iOS side has had prepare-build.sh guarding this since SCRUM-147; Android had
# nothing, because Android has never been built here.
#
# This is the Android half of that guard: swap the dotenv, run, and ALWAYS put
# it back.
#
# ─── THE RESTORE IS ON `trap ... EXIT`, NOT AT THE END ───────────────
#
# On 2026-08-18 a build script that restored `.env` on the happy path only left
# a worktree with no `.env` after a failure, and the next publish inlined EMPTY
# values — the app SIGABRTed on launch in production. Ctrl-C during a Gradle
# build is the common case here, so the restore has to survive it.

set -euo pipefail

cd "$(dirname "$0")/.."

STAGE="${1:-dev}"
VERSION="${2:-}"
CONFIRM="${3:-}"

# Default per stage, so the common case is one word.
if [ -z "$VERSION" ]; then
  case "$STAGE" in
    dev)     VERSION="2.1.0" ;;
    staging) VERSION="3.0.0" ;;
    prod)    VERSION=$(grep '"version"' app.json | head -1 | sed -E 's/.*"([0-9.]+)".*/\1/') ;;
  esac
fi

case "$STAGE" in
  dev|staging) ;;
  prod)
    if [ "$CONFIRM" != "--i-mean-it" ]; then
      echo "REFUSED: this would build a debug-signed APK against PRODUCTION."
      echo "  Real patients' PHI, on an unmanaged device, from a debug build."
      echo "  If you genuinely mean it:  $0 prod $VERSION --i-mean-it"
      exit 1
    fi
    ;;
  *)
    echo "Unknown stage '$STAGE'. Use: dev | staging | prod"
    exit 1
    ;;
esac

SRC=".env.${STAGE}"
[ "$STAGE" = "prod" ] && SRC=".env.prod"

if [ ! -f "$SRC" ]; then
  echo "Missing $SRC — cannot build without an explicit environment."
  exit 1
fi

# Snapshot whatever is in .env now, and put it back no matter how we leave.
BACKUP="$(mktemp)"
if [ -f .env ]; then cp .env "$BACKUP"; fi
restore() {
  if [ -f "$BACKUP" ]; then cp "$BACKUP" .env; rm -f "$BACKUP"; fi
  echo ""
  echo "  .env restored to how it was before this run."
  if [ -n "${ORIG_VERSION:-}" ]; then restore_stamps; fi
}
trap restore EXIT

# ── Stamp the tree for this stage, and put it back on the way out ────
#
# prepare-build.sh owns app.json's version / runtimeVersion / channel and the
# dotenv; the prebuild carries those into android/. Restoring is the same two
# steps in reverse, and it runs on EXIT so Ctrl-C during a 10-minute Gradle
# build cannot leave the tree stamped for dev — which is how a prod archive
# ends up talking to the dev API.
#
# THE RESTORE MUST RE-RUN prepare-build.sh, NOT JUST COPY app.json BACK.
#
# prepare-build.sh writes SEVEN coupled fields across FIVE files — app.json,
# ios/CSH/Supporting/Expo.plist, ios/CSH.xcodeproj/project.pbxproj,
# ios/CSH/Info.plist and the dotenv. An earlier version of this script snapshot
# only app.json, so after an Android run the iOS tree was left stamped
# 2.1.0 / channel `development`: an App Store archive taken at that moment
# would have shipped a binary pointing at the dev API. That is SCRUM-147's
# incident, reached from a new direction.
#
# So we record the stage + version that were in the tree BEFORE, and restore by
# running the same tool that changed them.
ORIG_VERSION=$(grep '"version"' app.json | head -1 | sed -E 's/.*"([0-9.]+)".*/\1/')
ORIG_BUILD=$(grep '"buildNumber"' app.json | head -1 | tr -dc '0-9')
ORIG_CHANNEL=$(grep -A1 'expo-channel-name' app.json | grep -oE '"(production|development|preview)"' | head -1 | tr -d '"')
case "$ORIG_CHANNEL" in
  production) ORIG_STAGE="prod" ;;
  development) ORIG_STAGE="dev" ;;
  preview)    ORIG_STAGE="staging" ;;
  *)          ORIG_STAGE="prod" ;;
esac

restore_stamps() {
  ./scripts/prepare-build.sh "$ORIG_STAGE" "$ORIG_VERSION" "$ORIG_BUILD" >/dev/null 2>&1 || true
  # Re-propagate into android/ too, so the whole tree matches again.
  npx expo prebuild -p android >/dev/null 2>&1 || true
  echo "  tree restored to $ORIG_STAGE $ORIG_VERSION ($ORIG_BUILD) — app.json, ios/ and android/."
}

./scripts/prepare-build.sh "$STAGE" "$VERSION" >/dev/null


# Say out loud what the bundle will talk to. A wrong environment is invisible
# once the APK is installed, and this line is the last chance to notice.
API=$(grep -E '^EXPO_PUBLIC_API_BASE_URL=' .env | cut -d= -f2- || echo '(unset)')
POOL=$(grep -E '^EXPO_PUBLIC_COGNITO_USER_POOL_ID=' .env | cut -d= -f2- || echo '(unset)')

# Carry app.json's stamps into android/. Without this the manifest keeps
# whatever the LAST prebuild wrote, which is how a dev build ended up
# declaring the production OTA channel.
echo "  Stamping android/ for ${STAGE} ${VERSION} ..."
npx expo prebuild -p android >/dev/null 2>&1

# Read the stamps back OUT of the generated files rather than trusting that the
# prebuild did what we asked. This is the same reason prepare-build.sh
# re-verifies after pod install: the generator has silently no-opped before.
A_RUNTIME=$(grep -oE '<string name="expo_runtime_version">[^<]*' android/app/src/main/res/values/strings.xml | sed 's/.*>//')
A_CHANNEL=$(grep -oE 'expo-channel-name&quot;:&quot;[^&]*' android/app/src/main/AndroidManifest.xml | head -1 | sed 's/.*;//')
A_VERSION=$(grep -oE 'versionName "[^"]*"' android/app/build.gradle | sed -E 's/.*"([^"]*)"/\1/')

EXPECTED_CHANNEL="development"
[ "$STAGE" = "prod" ]    && EXPECTED_CHANNEL="production"
[ "$STAGE" = "staging" ] && EXPECTED_CHANNEL="preview"

echo ""
echo "  stage      : $STAGE"
echo "  API        : $API"
echo "  Cognito    : $POOL"
echo "  version    : $A_VERSION"
echo "  OTA runtime: $A_RUNTIME"
echo "  OTA channel: $A_CHANNEL"
echo ""

# The OTA lane is the one that can reach a device AFTER it leaves your desk.
# A dev handset on the production channel would pull the bundle live patients
# are running, with prod endpoints compiled in.
if [ "$A_RUNTIME" != "$VERSION" ] || [ "$A_VERSION" != "$VERSION" ]; then
  echo "REFUSED: android/ says version '$A_VERSION' / runtime '$A_RUNTIME', expected '$VERSION'."
  echo "  The prebuild did not take. Do not ship a binary no OTA can reach."
  exit 1
fi
if [ "$A_CHANNEL" != "$EXPECTED_CHANNEL" ]; then
  echo "REFUSED: android/ is on OTA channel '$A_CHANNEL', but $STAGE expects '$EXPECTED_CHANNEL'."
  echo "  A $STAGE build on the '$A_CHANNEL' lane can receive $A_CHANNEL updates."
  exit 1
fi

# A last-line-of-defence check rather than trusting the file name: if a dotenv
# is ever edited to point somewhere it should not, the stage label is a lie and
# the URL is the truth.
if [ "$STAGE" != "prod" ] && echo "$API" | grep -qE 'api\.circlesupporthealth\.ai'; then
  echo "REFUSED: stage is '$STAGE' but the API is PRODUCTION. Check $SRC."
  exit 1
fi

echo "  Building ... (first run compiles the native project and takes a while)"
echo ""
npx expo run:android "${@:3}"
