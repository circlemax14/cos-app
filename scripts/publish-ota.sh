#!/bin/bash
#
# Publish an OTA to ONE environment.
#
#   ./scripts/publish-ota.sh dev     2.0.0 "SCRUM-715 gates"
#   ./scripts/publish-ota.sh staging 3.0.0 "SCRUM-715 gates"
#   ./scripts/publish-ota.sh prod    1.5.3 "SCRUM-715 gates"
#
# ─── WHAT "PROMOTING" MEANS HERE, AND WHY ────────────────────────────
#
# You promote the COMMIT, not the bundle.
#
# EXPO_PUBLIC_* values are INLINED into the JS bundle at build time
# (lib/api-client.ts:12, lib/cognito.ts:19, and two more). A bundle built for
# dev has api.dev + the dev Cognito pool compiled into it, permanently. So
# `eas update:republish` from dev to production would point every production
# patient at the dev API — and the app would look like it was working.
#
# Therefore: check out the same commit, run this once per environment, and let
# each publish bake the right endpoints. The JS logic is byte-identical; only
# the config differs, which is exactly what you want.
#
#   git checkout <commit>
#   ./scripts/publish-ota.sh dev     2.0.0 "msg"   # test on the dev build
#   ./scripts/publish-ota.sh staging 3.0.0 "msg"   # test on the stage build
#   ./scripts/publish-ota.sh prod    1.5.3 "msg"   # ship
#
# ─── WHY THIS CANNOT CROSS-CONTAMINATE ───────────────────────────────
#
# Two independent guards:
#   1. runtimeVersion tracks the major (1.x/2.x/3.x), and OTAs are
#      runtime-locked — an update at 2.0.0 is invisible to a 1.5.x binary.
#   2. Each build listens on its own channel (development/preview/production).
#
# Either alone would do; together a dev bundle physically cannot reach prod.

set -euo pipefail
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8   # CocoaPods/Expo need UTF-8; LANG is unset here

cd "$(dirname "$0")/.."

ENVIRONMENT="${1:-}"
VERSION="${2:-}"
MESSAGE="${3:-}"

usage() {
  cat <<'USAGE'
Usage: ./scripts/publish-ota.sh <prod|dev|staging> <version> "<message>"

  dev      2.x.y  -> channel/branch: development
  staging  3.x.y  -> channel/branch: preview
  prod     1.x.y  -> channel/branch: production
USAGE
  exit 1
}
[ -z "$ENVIRONMENT" ] || [ -z "$VERSION" ] || [ -z "$MESSAGE" ] && usage

case "$ENVIRONMENT" in
  prod)    BRANCH="production"  ;;
  dev)     BRANCH="development" ;;
  staging) BRANCH="preview"     ;;
  *) echo "!! unknown environment '$ENVIRONMENT'"; usage ;;
esac

# ── Refuse to publish from a dirty tree ─────────────────────────────────────
# You are promoting a specific commit through three environments. If the tree
# is dirty, the three publishes are not the same code and the whole point of
# the exercise is lost.
if [ -n "$(git status --porcelain -- ':!.env' ':!.expo' ':!ios/Pods')" ]; then
  echo "!! working tree is dirty — commit or stash first."
  echo "   Promotion only means something if all three publishes are the same commit."
  git status --short -- ':!.env' ':!.expo' ':!ios/Pods' | head -10
  exit 1
fi
COMMIT=$(git rev-parse --short HEAD)

# ── Set every version artifact + .env for this environment, and verify ──────
echo "=== preparing $ENVIRONMENT $VERSION (commit $COMMIT) ==="
# ── Restore on EXIT, not on success ────────────────────────────────────────
# COS-1040. prepare-build.sh below rewrites SEVEN version-stamped files and
# swaps .env, and .env is inlined into every bundle. This script previously
# restored nothing: with `set -euo pipefail` and several explicit `exit 1`s,
# ANY failure after this point left the checkout stamped for a non-prod
# environment with a non-prod .env still on disk.
#
# That is not hypothetical. On 2026-09-18 a failed dev precheck left app.json,
# both plists, the pbxproj, build.gradle, the manifest and strings.xml reading
# 2.1.0/development, and .env pointing at the dev API. An archive or a `git
# add -A` from that state ships dev config to production — which is COS-742
# (dev values committed to main) and the 2026-08-18 SIGABRT, twice over.
#
# cos-app/CLAUDE.md states the rule: a build script that swaps .env must trap
# the restore on EXIT, not at the end of the happy path. This is that trap.
# It restores unconditionally, including after a SUCCESSFUL non-prod publish —
# leaving the tree stamped for dev because the publish worked is the same
# hazard arriving by a happier route.
_OTA_STAMPED="app.json ios/CSH/Info.plist ios/CSH/Supporting/Expo.plist \
ios/CSH.xcodeproj/project.pbxproj android/app/build.gradle \
android/app/src/main/AndroidManifest.xml android/app/src/main/res/values/strings.xml"
_OTA_ENV_BACKUP="$(mktemp)"
cp .env "$_OTA_ENV_BACKUP" 2>/dev/null || true
_ota_restore() {
  local rc=$?
  cp "$_OTA_ENV_BACKUP" .env 2>/dev/null || true
  rm -f "$_OTA_ENV_BACKUP"
  # The tree was verified clean above, so HEAD is the correct restore target.
  git checkout -- $_OTA_STAMPED 2>/dev/null || true
  echo
  echo "   restored .env and the version stamps to HEAD."
  return $rc
}
trap _ota_restore EXIT

./scripts/prepare-build.sh "$ENVIRONMENT" "$VERSION" >/tmp/prep-ota.log 2>&1 || {
  echo "!! prepare-build.sh failed:"; tail -20 /tmp/prep-ota.log; exit 1; }
grep -E "^  (ok|FAIL)" /tmp/prep-ota.log | sed 's/^/  /'

API=$(grep '^EXPO_PUBLIC_API_BASE_URL' .env | cut -d= -f2-)

# ── Prove the endpoints really are inlined before publishing ────────────────
# This is the check that would have caught the 2026-08-18 crash: a bundle whose
# EXPO_PUBLIC_* baked in EMPTY, so the app SIGABRT'd on launch. Grep the HERMES
# BYTECODE, not the source map — a .map holds the ORIGINAL source, so it
# contains "process.env.EXPO_PUBLIC_API_BASE_URL" and zero occurrences of the
# value, which reads exactly like a failure on a perfectly healthy bundle.
echo
echo "=== verifying endpoints inline into the bundle ==="
rm -rf /tmp/ota-precheck
# --clear is NOT optional. COS-1040 — without it Metro serves a CACHED bundle
# whose EXPO_PUBLIC_* were inlined for whatever environment was exported last,
# ignoring the .env this script just swapped in. Observed 2026-09-18: a `dev`
# publish produced a bundle byte-identical to the previous `prod` one (same
# content hash), carrying the production API host and Cognito pool. The check
# below caught it, which is the only reason it was not published — but the
# cache is the bug and the check is the net, so clear the cache.
npx expo export --platform ios --output-dir /tmp/ota-precheck --source-maps --clear >/dev/null 2>&1
HBC=$(ls /tmp/ota-precheck/_expo/static/js/ios/*.hbc 2>/dev/null | head -1)
[ -z "$HBC" ] && { echo "!! export produced no bundle"; exit 1; }

HOST=$(echo "$API" | sed -E 's#https?://##; s#/.*##')
POOL=$(grep '^EXPO_PUBLIC_COGNITO_USER_POOL_ID' .env | cut -d= -f2-)
n_host=$(strings -a "$HBC" | grep -c "$HOST" || true)
n_pool=$(strings -a "$HBC" | grep -c "$POOL" || true)
printf "  API host in bundle   : %s  (%s)\n" "$n_host" "$HOST"
printf "  Cognito pool in bundle: %s  (%s)\n" "$n_pool" "$POOL"
if [ "$n_host" -lt 1 ] || [ "$n_pool" -lt 1 ]; then
  echo "!! endpoints did NOT inline — publishing this would ship an app that cannot reach its API."
  exit 1
fi

# ── Publish ────────────────────────────────────────────────────────────────
echo
echo "=== publishing to branch '$BRANCH' ==="
echo "  runtime : $VERSION"
echo "  API     : $API"
echo "  commit  : $COMMIT"
echo
# --clear-cache for the same reason as the precheck's --clear (COS-1040): this
# is a SEPARATE bundling run, so a clean precheck proves nothing about what
# actually gets published. Verifying one bundle and shipping another is worse
# than not checking at all.
EAS_SKIP_AUTO_FINGERPRINT=1 npx eas update \
  --branch "$BRANCH" \
  --clear-cache \
  --non-interactive \
  --message "$MESSAGE [$ENVIRONMENT $VERSION @ $COMMIT]"

echo
if [ "$ENVIRONMENT" != "prod" ]; then
cat <<WARN
ℹ️  .env and the version stamps are restored to HEAD automatically on exit
    (see the trap above). Nothing is left pointing at $ENVIRONMENT.
WARN
fi
echo "Rollback: npx eas update:list --branch $BRANCH   then"
echo "          npx eas update:republish --group <last-good-group-id>"
