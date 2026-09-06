#!/bin/bash
#
# Build and run cos-app on an Android device against ONE environment.
#
#   ./scripts/run-android.sh dev        (default)
#   ./scripts/run-android.sh staging
#   ./scripts/run-android.sh prod       (refuses without --i-mean-it)
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
CONFIRM="${2:-}"

case "$STAGE" in
  dev|staging) ;;
  prod)
    if [ "$CONFIRM" != "--i-mean-it" ]; then
      echo "REFUSED: this would build a debug-signed APK against PRODUCTION."
      echo "  Real patients' PHI, on an unmanaged device, from a debug build."
      echo "  If you genuinely mean it:  $0 prod --i-mean-it"
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
}
trap restore EXIT

cp "$SRC" .env

# Say out loud what the bundle will talk to. A wrong environment is invisible
# once the APK is installed, and this line is the last chance to notice.
API=$(grep -E '^EXPO_PUBLIC_API_BASE_URL=' .env | cut -d= -f2- || echo '(unset)')
POOL=$(grep -E '^EXPO_PUBLIC_COGNITO_USER_POOL_ID=' .env | cut -d= -f2- || echo '(unset)')
echo ""
echo "  stage      : $STAGE"
echo "  API        : $API"
echo "  Cognito    : $POOL"
echo ""

# A last-line-of-defence check rather than trusting the file name: if a dotenv
# is ever edited to point somewhere it should not, the stage label is a lie and
# the URL is the truth.
if [ "$STAGE" != "prod" ] && echo "$API" | grep -qE 'api\.circlesupporthealth\.ai'; then
  echo "REFUSED: stage is '$STAGE' but the API is PRODUCTION. Check $SRC."
  exit 1
fi

echo "  Building… (first run compiles the native project and takes a while)"
echo ""
npx expo run:android "${@:3}"
