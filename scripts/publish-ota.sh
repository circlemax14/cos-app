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
npx expo export --platform ios --output-dir /tmp/ota-precheck --source-maps >/dev/null 2>&1
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
EAS_SKIP_AUTO_FINGERPRINT=1 npx eas update \
  --branch "$BRANCH" \
  --non-interactive \
  --message "$MESSAGE [$ENVIRONMENT $VERSION @ $COMMIT]"

echo
if [ "$ENVIRONMENT" != "prod" ]; then
cat <<WARN
⚠️  .env still points at $ENVIRONMENT. It is inlined into every bundle.
    Before any prod publish or archive:  ./scripts/prepare-build.sh prod <version>
WARN
fi
echo "Rollback: npx eas update:list --branch $BRANCH   then"
echo "          npx eas update:republish --group <last-good-group-id>"
