# Native dependency review scope

Synced's authored application code and release policy are React Native TypeScript. Android projects are generated from Expo and published dependency plugins; they are not checked in. This source boundary does **not** make upstream native code audited or remove native runtime risk.

This is a focused release review plan and dependency inventory, not a completed security audit. Reassess the final lockfile and generated manifest after dependency integration. Capture exact installed versions and git SHAs from `package-lock.json`; do not substitute this table for a lockfile or SBOM.

| Dependency boundary | Main risk | Required release evidence |
| --- | --- | --- |
| Expo SDK 58 / React Native 0.88 / React 19.3 baseline | Compatibility with newly released native/runtime versions and upstream modules | Locked clean install, TypeScript/lint/tests, Android bundle/prebuild/build, emulator launch, physical cold-start and session test |
| `@livekit/react-native-webrtc`, `@livekit/react-native`, `livekit-client` and their Expo/config plugins | Native AAR/JNI compatibility; capture/service lifecycle; microphone and audio route behavior; unexpected permissions | Final merged permission allowlist, release R8 build, real-device rotation/lock/disconnect/capture-stop/voice teardown tests; inspect upstream advisories and release notes before public distribution |
| `react-native-accessibility-controller` pinned Git commit | Broad Accessibility capability, OEM tree differences, unmaintained/fork behavior and asynchronous action races | Confirm pinned SHA and source provenance, generated service disclosure/permission, app-level protected-surface restrictions, revocation race tests and physical role tests |
| `react-native-tcp-socket` | Native socket lifecycle, LAN interface assumptions and untrusted framed input | Private-interface policy, peer authentication, bounded framing, cancellation/timeouts, no residual listener after disconnect, hardware subnet/drop tests |
| Bluetooth native packages added by the final lockfile | Radio/Android version compatibility, permission drift, discovery leaks and transport assumptions | Document exact packages/versions, inspect Android manifests and plugin changes, verify legacy max-SDK limits, runtime deny/revoke paths, two-phone range/drop/reconnect tests |
| Expo device/network/intent/crypto modules and other generated transitive native modules | Permission creep, intent exposure, platform behavior and native ABI changes | Manifest and exported-component review, no unreviewed storage/camera/overlay permission, visible user-authorized intent flows, supported ABI verification |

The existing `-dontwarn livekit.org.jni_zero.JniZeroJni` rule is a narrowly scoped compatibility exception for a class referenced by an unused custom-class-loader path in the prefixed WebRTC AAR. Preserve its narrow scope. A successful R8 build establishes packaging success only; exercise normal JNI/capture/media initialization on real hardware. Do not expand it into blanket `-dontwarn` rules to make an unexplained build failure disappear.

For a production review, inspect package provenance and pinning, upstream advisories, install scripts and dependency patches, Android manifest service/exported declarations, MediaProjection foreground notification behavior, Accessibility service configuration, native network endpoints, and cryptographic usage in the final source. `npm audit` can identify some package advisories but does not audit native binaries, forked code, permission design or application authorization. Record findings and mitigations with the exact commit and build; unresolved findings remain limitations.

The release permission audit is fail closed: new native packages that add a permission must get a deliberate allowlist review and tests. Never silence the audit by removing a known forbidden-permission check. Source policy similarly rejects authored native files, custom bridges, dangerous native-code/build injection and credentials while permitting metadata-only Expo resource/manifest plugins.

## Feature edge evidence

`release-feature-edges.json` maps implemented core/controller features and release policies to test suites and concrete risks. Each unit needs at least **five distinct passing executed test names**. A unit may select several describe-prefixes from one test file. The source inventory catches unlisted core/controller files; reviewers must also split distinct features in a shared file into separate ledger entries. This is a minimum scenario gate, not line coverage or proof of complete testing.

Run tests with a Vitest JSON report, then audit it:

```sh
npm test -- --reporter=default --reporter=json --outputFile=.test-results/vitest.json
node scripts/check-feature-coverage.mts .test-results/vitest.json
```

The gate rejects failed/skipped/pending cases selected as evidence, duplicated test names, missing source units, reused identical selectors, weakened minima, and reports older than the implementation/tests/ledger. A reviewer still checks whether cases exercise meaningful boundaries and independent failure outcomes; five mechanically duplicated assertions are insufficient. Add new ledger rows and substantive tests together when introducing a feature.

## Bluetooth build metadata exception

The published `react-native-bluetooth-classic@1.73.0-rc.17` references its standard `BuildConfig` class without enabling its generation. AGP 9 leaves generation off. The TypeScript postinstall step enables only `buildFeatures.buildConfig` in that external package's build metadata. It checks the exact version and SHA-256 of the original metadata and refuses upstream drift or a duplicate preparation marker. Java/Kotlin adapter source is unchanged; no application native adapter is added. Twelve edge cases cover pinning, source drift, idempotence, truncation, byte preservation and relocated preparation markers. Reassess this exception when upgrading the package; a successful compiler run still does not establish radio interoperability.
