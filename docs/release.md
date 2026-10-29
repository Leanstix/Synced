# Android release preparation

The repository is prepared for a production EAS Android App Bundle and an internal EAS APK. The owner creates the final build after the final push. Physical two-phone qualification is deliberately pending until then; a passing emulator launch is not evidence that Bluetooth, capture, accessibility or microphone behavior works on real phones.

## Profiles and signing

| Build | Command profile | Output | Credentials | Purpose |
| --- | --- | --- | --- | --- |
| GitHub Android workflow | none; generated Gradle release | optimized APK, arm64 + x86_64 | generated **debug key** | CI installation and emulator launch only |
| EAS preview | `preview` | APK | EAS remote credentials | internal device qualification |
| EAS production | `production` | AAB | EAS remote credentials | Play internal testing, then release |

Production declares `credentialsSource: remote`, `distribution: store`, `developmentClient: false`, `buildType: app-bundle`, and automatic remote version increments. The policy rejects local credentials, unsigned profiles, custom Gradle task overrides, inherited profile settings, and mismatched environments/channels. No signing key, password, Expo account, or token is needed to review or test this repository.

The CI APK is explicitly debug-signed, including its artifact name and signing notice. Its signature is not a production identity. Do not upload that APK to Play or use its key to establish the production app identity. An installed debug preview may need uninstalling before an APK signed with the production key can be installed; uninstalling clears local app data.

## Owner's first build after the push

Use Node **24.22.1**, matching `eas.json` and CI. From a clean checkout of the final commit:

```sh
npm ci
npm run check
npm run bundle:android
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest credentials:configure-build --platform android --profile production
npx eas-cli@latest build:version:get --platform android --profile production
npx eas-cli@latest build --platform android --profile preview
```

`eas init` links the owner's Expo project. For this dynamic app config, follow the CLI instructions to set the real `extra.eas.projectId`; do not invent a project ID. Review any resulting config change. Keep credentials on EAS and in the owner's protected backup, never in this repository. Record the upload certificate SHA-256 fingerprint independently through EAS credentials. If this package has already been published, run `eas build:version:set` to seed the last published Android version before allowing automatic increments. The local default is version code 1; EAS manages subsequent production codes remotely.

After the post-push physical checks in [release-qualification.md](release-qualification.md), create the final bundle:

```sh
npx eas-cli@latest build --platform android --profile production
```

The production profile supplies `APP_ENV=production`. For a local config-only review, set both `EAS_BUILD_PROFILE=production` and `APP_ENV=production` before `npm run check:release`; this does not create or sign a build. `ANDROID_VERSION_CODE` accepts canonical positive integers up to 2,100,000,000; EAS remote versioning is authoritative for production. `ANDROID_ABIS` permits unique `arm64-v8a,x86_64` entries and production always requires arm64. `RELEASE_CHANNEL`, if supplied, must match the profile. No OTA update service is claimed by the channel field.

## Verify the delivered artifact

Keep the EAS build URL, source commit, build profile, package/version, artifact SHA-256 and signing fingerprint with the release record. Verify an AAB's JAR signature with `jarsigner -verify` and inspect its certificate with `keytool -printcert -jarfile app.aab`; compare its SHA-256 to the independently recorded **upload** certificate and reject `Android Debug`. Play App Signing may use a different app-signing certificate for delivered APKs; compare those against the Play Console app-signing certificate instead.

For APKs, `apksigner verify --print-certs` must succeed before calling `scripts/audit-manifest.mts`. The audit accepts aapt permissions, aapt badging and apksigner certificate output and compiled XML from `apkanalyzer manifest print` as four files. AAPT permission summaries omit maximum SDK bounds; the compiled manifest supplies that evidence. A production APK audit additionally requires `APP_ENV=production` and `EXPECTED_SIGNER_SHA256` from the independently verified certificate. The fingerprint is public; private keys and passwords must never be passed as command arguments or written to logs. AAB permissions must be inspected from the generated manifest or a Play/bundletool-generated APK; an APK-only audit is not an AAB signature audit.

The permission allowlist intentionally includes microphone access for an explicitly accepted intercom and Bluetooth scan/connect/advertise for nearby sessions. Camera, overlays, shared storage and all unreviewed permissions fail the APK audit. Legacy Bluetooth permissions must have `maxSdkVersion <= 30`. Recheck merged manifests whenever native packages change.

## What has and has not been established

Automated evidence covers source boundaries, release intent, executed feature edge cases, JavaScript bundling, optimized CI APK creation, merged APK metadata and an emulator launch when the workflow passes. Hardware behavior, OEM accessibility differences, Bluetooth radio interoperability, microphone routing, and store policy review require the qualification record. Do not interpret readiness configuration as a security certification or a completed native dependency audit.

References: [EAS build configuration](https://docs.expo.dev/eas/json/), [remote Android version management](https://docs.expo.dev/build-reference/app-versions/), [production builds](https://docs.expo.dev/build/eas-json/).
