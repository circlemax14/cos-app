# OTA publish workflow (cos-app)

This is how we ship JavaScript-only changes to TestFlight/App Store users
without cutting a new native build. It's deliberately conservative because
silent OTA failures on iOS have bitten us multiple times.

## TL;DR

```bash
# 1. Validate on TestFlight Internal first
npm run eas:update:preview -- "feat(scope): short imperative summary"

# 2. Verify on a TestFlight Internal device:
#    Settings → About → Update ID matches the published group

# 3. Promote the same commit to production
npm run eas:update:prod   -- "feat(scope): short imperative summary"
```

Both commands wrap `eas update` with `EAS_SKIP_AUTO_FINGERPRINT=1` so the
device doesn't silently reject the bundle (see "Why" below).

## Channels and runtime versions

| Channel       | Branch        | Backend                              | Audience                          |
| ------------- | ------------- | ------------------------------------ | --------------------------------- |
| `development` | (any)         | `api.dev.circlesupporthealth.ai`     | Local Expo Go / dev clients       |
| `preview`     | `preview`     | `api.staging.circlesupporthealth.ai` | TestFlight Internal Testing       |
| `production`  | `production`  | `api.circlesupporthealth.ai`         | TestFlight External + App Store   |

`runtimeVersion` is **static** in `app.json` (currently `"1.1.0"`). It must
match the value baked into the binary at archive time. Bump it ONLY when
you cut a new native build through `eas build --profile production`. Never
mid-cycle.

## Pre-flight checklist (every publish)

1. `git status` is clean and you're on the commit you intend to ship.
2. `npx tsc --noEmit` is clean (pre-existing SDK errors aside).
3. `npm run lint` shows 0 errors.
4. `app.json` `"runtimeVersion"` matches the latest binary you can install.
5. You can name the channel out loud: `preview` or `production`. If you
   can't, stop and check.

## Verify the OTA actually applied

Don't trust the "Published!" line from eas-cli — verify on device:

1. Open the app on TestFlight or production
2. Settings → **About** → tap **Check for Updates**
3. If it says **Up to date** but the EAS dashboard shows a newer group,
   the device rejected the bundle silently. Republish without the
   fingerprint stamp (the wrapper already does this) and try again.
4. Tap **Download & Restart** when prompted
5. After the app restarts, return to About and confirm **Update ID**
   matches the new group's per-platform update id

## Why `EAS_SKIP_AUTO_FINGERPRINT=1`?

Even with a static `runtimeVersion`, `eas-cli` stamps every published
update with a computed fingerprint of the project's native config and
modules. Historically, the EAS CDN has filtered updates whose stamped
fingerprint didn't match the binary's expected fingerprint, leading to
two failure modes:

- **Silent rejection on iOS 17/18 binaries (1.0.4 era)**: `Updates.checkForUpdateAsync()` returned "no update available" even
  when a newer bundle was clearly visible on the dashboard. Symptom on
  the user side: About → Check for Updates says "Up to date".
- **Crash on iOS 26 binaries**: `expo.controller.errorRecoveryQueue` raised an unhandled
  `NSException` while processing a fingerprint-rejected manifest, aborting the
  app and forcing fallback to the embedded bundle.

Stripping the fingerprint stamp avoids both. The device falls back to the
plain `runtimeVersion` match, which is what we want — the fingerprint
adds nothing when `runtimeVersion` is static.

## Rollback

If a published OTA breaks production, republish the previous good update
group to the same channel:

```bash
# Find the previous good group on the EAS dashboard or via:
EAS_SKIP_AUTO_FINGERPRINT=1 npx eas-cli update:list --branch production --limit 5

# Then republish it:
EAS_SKIP_AUTO_FINGERPRINT=1 npx eas-cli update:republish \
  --group <previous-group-id> \
  --message "rollback: revert <bad-group-id> — <one-line reason>"
```

`update:republish` reuses the original update's manifest (same fingerprint,
same assets), so it always applies cleanly.

## What we deliberately don't do

- **Never** publish from a feature branch directly to `production`. Always
  merge to `main` first, then publish from main. Feature-branch publishes
  diverge from the binary's gitCommitHash and complicate rollback.
- **Never** run `eas update` from inside a `git rebase` / merge in
  progress. eas-cli reads the working tree, not just `HEAD`.
- **Never** bump `runtimeVersion` to ship an OTA. If you need a new
  runtime, you need a new EAS Build.
