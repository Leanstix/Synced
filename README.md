<p align="center"><img src="docs/brand.svg" width="400" alt="Synced linked-S logo"></p>
<h1 align="center">Synced</h1>
<p align="center">Your other phone. Within reach.</p>

Synced is a **React Native and TypeScript** Android app for viewing and operating a second Android phone over local Wi-Fi or a personal hotspot. Install the same app on both phones, intentionally connect them, and approve access on the sharing phone.

**Development preview.** This is an implementation under validation, not a production remote-access guarantee. Android's consent and permission boundaries apply.

## Stack

- React Native 0.88.1, React 19.3, strict TypeScript.
- TypeScript interface, session state adapter, local consent dialogs, action validation, and remote viewport gesture mapping.
- Java Android adapters for sockets/cryptography, MediaProjection, AccessibilityService, notifications, and clock intents. No authored Kotlin application code.
- Direct encrypted local TCP connections; no cloud account, relay, message-platform login, or analytics backend.

Android's screen capture and system input APIs require native adapters. The application interface is React Native; the Java platform bridge supplies those Android capabilities.

## Implemented

- Private ten-minute invitation with a 256-bit random secret.
- Matching six-digit pairing verification and explicit approval on the sharing phone.
- Encrypted screen preview, after Android's screen-sharing consent.
- Optional taps, single-finger swipes, Back/Home/Recents, and focused-field text replacement after the owner enables accessibility and allows control.
- Clock shortcuts to open alarms, request set/dismiss/snooze, and inspect the visible result.
- Capture notification with stop/revoke, local disconnect, lock and rotation safeguards, and network-loss timeout.
- Original linked-S identity and dark citron Connect/Share interface with genuine empty, pending, active, and failure states.

**Not implemented:** Bluetooth transport, internet relay, persistent trusted-device pairing, iPhone hosting, forwarded call audio, multi-touch, or gaming-grade video. Messaging uses the actual remote app's interface. Text replacement does not automatically send a message.

## Run in development

Use Node 24, JDK17, Android SDK platform37/build-tools37.0.0, NDK27.1.12297006, and CMake3.22.1. The app supports Android8.0/API26 and later.

```sh
npm ci
npm run typecheck
npm test
npm start
# In another terminal, with a device/emulator connected:
npm run android
```

Set `ANDROID_HOME` or create untracked `android/local.properties` with `sdk.dir=/absolute/path/to/android-sdk`. Development debug builds use Metro. The Gradle wrapper pins9.4.1; the React Native Gradle plugin pins Android Gradle Plugin9.2.1.

## Build an installable preview

```sh
cd android
./gradlew testDebugUnitTest lintDebug assemblePreview
adb install -r app/build/outputs/apk/preview/app-preview.apk
```

The **preview** variant includes its TypeScript/JavaScript bundle and Hermes runtime, so it does not need Metro. It uses a development signing key and is not a store release. GitHub Actions builds ARM64/x86_64 previews and uploads the APK when checks pass. Build all default ABIs locally for a32-bit device. Debug keys differ between machines; Android may require uninstalling a preview before installing one signed elsewhere.

## Connect your phones

1. Install Synced on both Android phones. Connect both to the same Wi-Fi, or connect the controller to the sharing phone's hotspot.
2. On the phone to access, open **Share** and create an invitation. Transfer it privately; it contains a secret.
3. On the phone in your hand, open **Connect**, paste the complete invitation, and connect.
4. Compare the six-digit pairing code on both phones. Approve only the intended matching request on the sharing phone.
5. On the sharing phone, start screen sharing and choose the **entire screen** in Android's dialog.
6. For touch input, read the accessibility disclosure, enable Synced in Android settings, return, and explicitly allow control.
7. Use the remote view or clock shortcuts. If the host is still showing Synced, use remote **Home** first; Synced protects its own controls from remote input.
8. End the session with **Stop** or **Disconnect**. After host rotation, allow control locally again.

There is no automatic discovery. Some routers/hotspots isolate clients and block peer connections. Invitations currently choose the host's preferred local interface; multiple concurrent networks or a VPN may require changing the phone's network setup.

## The morning-alarm constraint

Initial pairing cannot bypass Android's per-session screen-capture consent. Locking the host, stopping projection, losing the process/network, or ending the session can require fresh approval. This app deliberately blocks locked-phone input and cannot guarantee dismissal of an arbitrary clock app's alarm while the host is locked and unattended. Clock behavior must be checked on your actual devices.

## Review and validation

- [Validation status](docs/VALIDATION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Security model](SECURITY.md)
- [Physical-device acceptance matrix](docs/DEVICE_TESTING.md)
- [Roadmap](docs/ROADMAP.md)
- [Contributing](CONTRIBUTING.md)

## Android references

[MediaProjection](https://developer.android.com/media/grow/media-projection) · [Accessibility gestures](https://developer.android.com/guide/topics/ui/accessibility/service) · [Clock intents](https://developer.android.com/reference/android/provider/AlarmClock) · [React Native Android modules](https://reactnative.dev/docs/legacy/native-modules-android)

MIT. See [LICENSE](LICENSE).
