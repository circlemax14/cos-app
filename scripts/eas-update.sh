#!/usr/bin/env bash
#
# eas-update.sh — wrapper around `eas update` that:
#   - sets EAS_SKIP_AUTO_FINGERPRINT=1 by default to avoid silent rejection
#     by the EAS CDN when eas-cli's computed fingerprint diverges from the
#     binary's stamped fingerprint (we use a static runtimeVersion, so the
#     fingerprint stamp adds nothing useful)
#   - forwards any extra args straight through to eas-cli
#   - prints a friendly summary up front so you remember which channel is
#     about to receive an OTA
#
# Usage:
#   ./scripts/eas-update.sh preview "fix: typo on About screen"
#   ./scripts/eas-update.sh production "feat: SCRUM-123 — clinical insights v2"
#
# Or via npm:
#   npm run eas:update:preview -- "<message>"
#   npm run eas:update:prod -- "<message>"
#
# Why EAS_SKIP_AUTO_FINGERPRINT=1:
#   With a static runtimeVersion in app.json, the device only checks
#   runtimeVersion compatibility — never the computed fingerprint. But
#   eas-cli still stamps each update with a fingerprint by default, and
#   the EAS CDN historically filters updates whose stamped fingerprint
#   doesn't match the binary's. Result: "Up to date" on the device even
#   when a newer bundle is published. Skipping the fingerprint stamp
#   makes the device match purely on runtimeVersion, which is what we
#   actually want.

set -euo pipefail

CHANNEL="${1:-}"
MESSAGE="${2:-}"

if [[ -z "$CHANNEL" || -z "$MESSAGE" ]]; then
  echo "Usage: $0 <channel> <message>" >&2
  echo "  channel  : preview | production" >&2
  echo "  message  : descriptive text shown in EAS dashboard + dev console" >&2
  exit 64
fi

if [[ "$CHANNEL" != "preview" && "$CHANNEL" != "production" ]]; then
  echo "error: channel must be 'preview' or 'production' (got: '$CHANNEL')" >&2
  exit 64
fi

GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
RUNTIME="$(grep -E '"runtimeVersion"' app.json | sed -E 's/.*"runtimeVersion":[[:space:]]*"([^"]+)".*/\1/')"

cat <<EOF
─── EAS Update ────────────────────────────────────────────────
  Channel        : $CHANNEL
  Branch         : $CHANNEL
  Runtime version: $RUNTIME
  Git HEAD       : $GIT_SHA
  Fingerprint    : SKIPPED (EAS_SKIP_AUTO_FINGERPRINT=1)
  Message        : $MESSAGE
───────────────────────────────────────────────────────────────
EOF

if [[ "$CHANNEL" == "production" ]]; then
  echo
  echo "⚠  Publishing to PRODUCTION. This will reach all real users on runtime $RUNTIME."
  echo "   Recommended: publish to 'preview' first, validate on TestFlight/Internal,"
  echo "   then republish the validated commit to 'production'."
  echo
fi

EAS_SKIP_AUTO_FINGERPRINT=1 npx eas-cli update \
  --branch "$CHANNEL" \
  --message "$MESSAGE" \
  --non-interactive \
  "${@:3}"
