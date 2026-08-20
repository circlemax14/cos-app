# cos-app — React Native / Expo patient app

## 🚫 STRICT RULE — THE MAJOR VERSION IS THE ENVIRONMENT

cos-app maintains **three parallel builds**. The major version identifies which
environment a binary talks to. This is not a convention you may quietly change.

| Major | Environment | dotenv | OTA channel / branch | API | Cognito pool |
|---|---|---|---|---|---|
| **1.x.y** | production | `.env.prod` | `production` | `api.circlesupporthealth.ai` | `us-east-1_OBayj1vez` |
| **2.x.y** | dev | `.env.dev` | `development` | `api.dev.circlesupporthealth.ai` | `us-east-1_T5uZyFxGC` |
| **3.x.y** | staging | `.env.staging` | `preview` | `api.staging.circlesupporthealth.ai` | `us-east-1_T5uZyFxGC` |

`runtimeVersion` **tracks the major**, so each environment has its own OTA lane —
an update published at runtime 2.0.0 is invisible to a 1.5.x binary. Combined
with the per-environment channel, a dev bundle physically cannot reach
production. **Do not "simplify" this by sharing a runtimeVersion.**

Staging deliberately **shares dev's Cognito pool** — documented in
`cos-backend/scripts/validate-deploy-env.mjs` → `EXPECTED_BY_STAGE.staging`.
Staging uses the **test** Fasten id, never the live one.

### Never hand-edit versions. Use the scripts.

```bash
./scripts/prepare-build.sh <prod|dev|staging> <version> [buildNumber]   # then archive in Xcode
./scripts/publish-ota.sh   <prod|dev|staging> <version> "<message>"     # OTA
```

`prepare-build.sh` sets **seven coupled fields** across four files plus the
dotenv, and re-verifies every one **after `pod install`** — the step that has
silently reverted them before. It refuses a major that does not match the
environment.

The seven: `app.json` (version, buildNumber, runtimeVersion, expo-channel-name),
`ios/CSH/Supporting/Expo.plist` (EXUpdatesRuntimeVersion, expo-channel-name),
`ios/CSH.xcodeproj/project.pbxproj` (MARKETING_VERSION, CURRENT_PROJECT_VERSION
— Debug *and* Release), `ios/CSH/Info.plist` (CFBundleShortVersionString,
CFBundleVersion).

**Why this is automated:** SCRUM-147 shipped a 1.3.0 binary whose `Expo.plist`
still read 1.2.0, so no OTA could ever reach it. SCRUM-151 archived as 1.2.0 (8)
when `app.json` said 1.3.1. Both were Expo's *Configure project* run script
silently not syncing, and both were found only after distribution.

⚠️ `app.json`'s `expo-channel-name` matters as much as the plist's: the Expo run
script **regenerates the plist from app.json during xcodebuild**, i.e. *after*
any pre-archive check. Set and verify both.

## 🚫 OTA promotion — promote the COMMIT, never the bundle

```bash
git checkout <commit>
./scripts/publish-ota.sh dev     2.0.0 "SCRUM-X"   # test on the dev build
./scripts/publish-ota.sh staging 3.0.0 "SCRUM-X"   # test on the stage build
./scripts/publish-ota.sh prod    1.5.3 "SCRUM-X"   # ship
```

`EXPO_PUBLIC_*` values are **inlined into the JS bundle at build time**
(`lib/api-client.ts`, `lib/cognito.ts`, `components/unified-plan/v2/net.ts`,
`services/entity-photo-upload.service.ts`). A bundle built for dev has the dev
API and dev Cognito pool compiled in permanently.

**Therefore `eas update:republish` from dev to production would point every
production patient at the dev API — and the app would look like it was
working.** Re-publish per environment instead; the JS logic is identical and
only the config differs, which is the intent.

## 🚫 Build rules

- **NEVER run `eas build`.** Free plan, no credits. App Store binaries come from
  a **local Xcode archive**; device test builds from `npx expo run:ios --device`.
- **NEVER `eas update` / `expo export` from a git worktree.** Worktrees have no
  `.env` (gitignored), so `EXPO_PUBLIC_*` bake in EMPTY and the app SIGABRTs on
  launch. This crashed production on 2026-08-18. Build from the canonical
  `cos-app` checkout with real `node_modules` and real `.env`.
- **`export LANG=en_US.UTF-8`** before any local iOS build. `LANG` is unset on
  this machine and CocoaPods dies with a Ruby `Encoding::CompatibilityError`
  inside `pod install`, before anything compiles — the trace looks nothing like
  a locale problem. The scripts already do this.
- **`.env` is inlined into every bundle.** After archiving or publishing a
  non-prod build, restore it: `./scripts/prepare-build.sh prod <version>`. A
  build script that swaps `.env` must `trap` the restore on **EXIT**, not at the
  end of the happy path.
- **Verify inlining by grepping the Hermes bytecode, NOT the source map.** A
  `.map` holds the *original* source, so it contains
  `process.env.EXPO_PUBLIC_API_BASE_URL` and **zero** occurrences of the value —
  which reads exactly like failure on a perfectly healthy bundle.
  `strings -a <bundle>.hbc | grep api.circlesupporthealth.ai`

## ⚠️ All three builds share one bundle id

`ai.circlesupporthealth.csh` for prod, dev and staging. They **cannot coexist on
a device** — installing one replaces the others — and all upload to the same App
Store Connect record. This is accepted. Separating them would need new App IDs,
provisioning profiles, push keys and **new Google OAuth iOS client ids** (those
are bundle-id scoped, so Google Sign-In breaks otherwise) — Apple-portal work.

## iOS 26 rendering envelope

This app has crashed in production from cold-mount rendering. Keep changes
**subtractive**: plain `{cond && <X />}` gates, no new wrapper components, no new
`react-native` primitive imports on a screen you are only gating.

`react-native-paper-tabs` `<TabScreen>` with **more than one direct child**
crashes the native snapshot on iOS 26. Keep it to one child and nest inside.

Governing doc: `cos-backend/docs/adr/0003-home-page-redesign.md`.

## Stack

Expo Router, React Query, expo-updates OTA, Cognito auth, HealthKit, Sentry.
Tests: `npm test` → `node --test`. No `@/` alias in `node --test` files — read
source as text instead.

## Git workflow

Branch off `main`; never push directly to `main`. Run `npx tsc --noEmit`,
`npx eslint`, and `npm test` before pushing. File a SCRUM story for every
`COS-{n}` branch before pushing.
