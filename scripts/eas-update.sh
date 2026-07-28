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

# COS-356 — runtime version drift guard. Fails the OTA if the 5 iOS
# version artifacts disagree with each other OR if package.json has
# been modified since the last runtimeVersion bump (probable native-dep
# add without a binary cut → OTA would crash existing users on launch).
# See SCRUM-493 (2026-06-19 incident) for the failure mode this catches.
echo
node scripts/check-runtime-version.mjs

# 2026-07-28 — branch-divergence guard. Warns when HEAD is missing commits
# from recently-active `COS-*` branches, so we never repeat the silent-
# delete regression the vaccines-flip reconciliation OTA had to unwind
# (Wave 2 + Wave 3 OTAs @ groups 533d8d83 / db20301a shipped from a
# release branch without merging Ken's chunks 111-131 from
# origin/COS-481/vaccines-ehr-hydrate-fe, silently dropping ~20 commits
# of iterative UI work from production). See
# feedback_ota_from_correct_source_branch + the vaccines-flip commit
# message on release-hs3b-ota-1.5.2 for the full incident narrative.
#
# The guard checks every `refs/remotes/origin/COS-*/*` branch that had
# activity in the last 14 days and reports how many commits each is
# ahead of HEAD. If any branch is ahead, the script exits non-zero
# unless EAS_SKIP_BRANCH_CHECK=1 is set (bypass valve for intentional
# behind-cuts, e.g. rolling back to an older commit on purpose).
if [[ "${EAS_SKIP_BRANCH_CHECK:-}" != "1" ]]; then
  git fetch --prune origin >/dev/null 2>&1 || true
  CUTOFF_TS=$(( $(date +%s) - 14 * 24 * 3600 ))
  MISSING=""
  # `-committerdate` sort → newest branches first; head -50 caps runtime
  # even if the repo grows a huge backlog of stale COS-* branches.
  while IFS= read -r branch; do
    [[ -z "$branch" ]] && continue
    ahead=$(git rev-list --count "$branch" ^HEAD 2>/dev/null || echo 0)
    [[ "$ahead" -eq 0 ]] && continue
    last_ts=$(git log -1 --format=%at "$branch" 2>/dev/null || echo 0)
    [[ "$last_ts" -lt "$CUTOFF_TS" ]] && continue
    last_rel=$(git log -1 --format='%cr' "$branch" 2>/dev/null)
    MISSING+="  - ${branch}  (${ahead} commits ahead of HEAD; last activity ${last_rel})"$'\n'
  done < <(git for-each-ref --format='%(refname:short)' --sort=-committerdate refs/remotes/origin/COS-*/* 2>/dev/null | head -50)

  if [[ -n "$MISSING" ]]; then
    cat >&2 <<GUARD

⚠  BRANCH-DIVERGENCE GUARD (2026-07-28)

HEAD (${GIT_SHA}) is missing commits from these recently-active COS-* branches:

${MISSING}
If any of them carries Ken's iterative UI work (chunk N commits,
dark-launch scaffolds, iOS 26 crash fixes), OTAing without merging
them first would SILENTLY DELETE those changes from production.

This is the exact anti-pattern that caused the 2026-07-28 vaccines-
flip reconciliation OTA (Wave 2/3 groups 533d8d83 + db20301a
inadvertently dropped chunks 111-131 from prod). See
project_wellbeing_library_expansion_epic.md for the runbook +
feedback_ota_from_correct_source_branch.md for the underlying rule.

To reconcile before OTAing:
  git merge origin/<branch> --no-edit -m "Reconcile <branch> into HEAD before OTA"
  # resolve any conflicts, verify: npx tsc --noEmit
  # then re-run this script

To bypass this guard (e.g. rolling back to an older commit on
purpose, or you have confirmed the divergent branch is stale):
  EAS_SKIP_BRANCH_CHECK=1 $0 $CHANNEL "$MESSAGE" ${@:3}

GUARD
    exit 3
  fi
fi

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
