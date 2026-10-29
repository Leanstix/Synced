# Synced

<img src="assets/logo.svg" alt="Two connected phones" width="96" />

An Android phone sharing app built with **React Native and TypeScript**. Pair two phones deliberately on the same Wi-Fi or hotspot, view the shared screen, and optionally allow remote gestures and typing. Bluetooth offers an encrypted control connection without screen video. Saved pairing and an optional Wi-Fi voice link are available after separate consent.

This is a fresh restart. The earlier implementation was removed from the current branches; its history remains available. No application Java, Kotlin, custom native adapter, or Android/iOS project is maintained here. Expo generates platform projects from React Native dependency plugins during builds. Those external packages contain the platform implementation, as React Native device capabilities require.

## Current behavior

| Feature | Status |
| --- | --- |
| Same Wi-Fi / hotspot | Direct TCP pairing and WebRTC video; optional private host IP override |
| Intentional pairing | Strong per-session invitation, matching verification code, explicit host approval |
| Screen viewing | Android consent dialog, entire-screen selection, visible foreground sharing service |
| Remote input | Separate local approval and Android Accessibility permission; taps, long presses, swipes, Home/Back/Recents |
| Typing | Replaces text in one focused editable field; tap the target field first |
| Messaging apps | Operate their visible UI where Android allows; no WhatsApp/Facebook account integration |
| Alarm setup | Opens the host clock's alarm setup UI; does not claim the alarm was saved |
| Ringing alarm dismissal | Depends on the clock UI; protected system surfaces are blocked |
| Saved phones | Both phones explicitly save; encrypted device storage, identity-bound reconnect, bounded opt-in retries and Forget |
| Bluetooth | Android Classic RFCOMM with OS-bonded phones; encrypted controls after separate host consent; no video |
| Voice link | Separately accepted Synced intercom over Wi-Fi; local microphone permission, mute and end controls |
| Dialer | Opens the host dialer with a validated number after the host grants control; no automatic dialing |
| Cellular call audio | Not forwarded; the voice link is independent of SIM/carrier calls |
| Game streaming | Basic touch input only; performance and game compatibility have not been established |
| iOS | Not supported by this build |

There are no seeded devices, simulated connections, mock screen frames, cloud rooms, STUN servers, or TURN relays in the application runtime. A router with client isolation may prevent a connection. Hotspot hosts sometimes need their private gateway address entered manually.

## Run on two Android phones

Requires Node 24.3+, Android SDK/JDK 17, and Android 8+ devices. **Expo Go cannot run these native dependencies.** Use an Expo development build or the CI preview APK.

```sh
npm ci
npm run android
npm start
```

1. Connect both phones to the same router, or connect one to the other's hotspot.
2. On the phone being controlled, choose **Share** and create an invitation.
3. Transfer that invitation privately to your other phone and paste it into **Connect**. It contains a session secret; do not post it publicly. Unused invitations expire after ten minutes.
4. Compare the code shown on both phones. Approve the peer on the host only if they match.
5. Start screen sharing on the host and choose **Entire screen** in Android's dialog. App-only sharing is unsuitable for device control.
6. For control, enable Synced in Android Accessibility settings, return to Synced, and separately allow the paired peer to control it. Then open the intended app or use Home.
7. Stop control, stop sharing, or disconnect from Synced when finished. Disconnect invalidates the invitation and grants. Save on both phones to reconnect without a new invitation; sharing and control still require fresh approval.

Rotation stops capture and requires sharing again so touches are remapped. The receiver also disables gestures when video and screen aspect ratios differ. This cannot detect every same-aspect app-only crop, so entire-screen selection remains necessary.

## Saved phones, Bluetooth and voice

On an approved session, choose Save on **both** phones. Synced stores a dedicated pairing key in encrypted device storage, not the one-use invitation. The saved phone's role determines whether this phone connects or explicitly listens for that peer. On Wi-Fi, both sides must use the same private host address and port; update the saved reconnect address if the hotspot subnet changes. Retry is opt-in, bounded and cancellable. A successful reconnect never restores screen capture, remote control or microphone access.

Forget blocks the peer immediately. If secure storage cannot persist deletion, the phone stays visible as **Retry forget**, with reconnect blocked for the current run. Retry deletion before restarting; an I/O failure cannot guarantee durable revocation. Saved records are not a cloud account or backup, and reinstalling/uninstalling can remove them.

For Bluetooth, pair the phones in Android settings first, then select the real bonded device in Synced. Enable Bluetooth and discoverability when requested, exchange the private Bluetooth invitation, compare codes and approve. Bluetooth offers controls without a live preview, so the host must separately approve that access. Use Wi-Fi for screen viewing or voice. Hotspot membership alone grants no access.

The optional voice link connects the two Synced apps. One phone invites and the other accepts; each microphone requires OS permission. Opening Android's permission dialog does not start recording: Synced waits briefly for its own screen to resume before acquiring a microphone. Either side can mute or end the link, and leaving the foreground stops acquired audio. It does not forward SIM call audio or guarantee answering protected OEM call screens. The dialer shortcut opens the normal phone UI; the owner completes the call there.

## Permission and security boundary

- Pairing uses a random 256-bit invitation secret, fresh nonces, HKDF direction-specific keys, AES-GCM authenticated messages, and strictly ordered replay rejection. The short displayed code is a human comparison, never the encryption key.
- Pairing, viewing, and control are separate grants. Unexpected disconnects, stopped capture, and revoked Accessibility access stop control.
- Local network signaling is bounded and encrypted. WebRTC protects video transport. There is no custom background persistence, remote unlock, camera feed, or stored message history. Microphone capture belongs only to an explicitly accepted Synced voice link and ends when the app leaves the foreground.
- Remote input is blocked for unknown windows and selected sensitive system/package surfaces. Android can hide secure screens. The accessibility package does not reliably expose password metadata; **do not share password fields or sensitive apps**. Package-name checks are a conservative guard, not a security sandbox.
- An already dispatched native gesture cannot be recalled. Permission dialogs, lock screens, OEM alarm/call interfaces, battery management, and Accessibility implementations vary by device. Successful compilation does not establish compatibility with every phone.

The background capture service comes from the external WebRTC/LiveKit Expo packages. No LiveKit server, account, or hosted room is used. Reliability while controlling another app still needs testing on actual phones; Android may stop sharing when it locks or kills the process.

## Development and verification

```sh
npm run check            # source boundary, strict types, lint, behavioral tests
npm run bundle:android   # production Android JS bundle
npm run prebuild:android # generated platform output stays ignored
```

CI runs these checks, audits the merged APK permissions/signature, and launches the ARM64/x86_64 preview on an Android emulator. The edge-case ledger requires at least five executed passing cases per registered feature; skipped or stale results do not count.

CI builds an ARM64/x86_64 preview APK. The preview uses generated development signing and is intended for personal device testing, not store publication. See [Android workflow](.github/workflows/android.yml), [owner build/signing steps](docs/release.md), and [physical phone qualification](docs/release-qualification.md).

The Accessibility dependency is experimental and pinned to [upstream source](https://github.com/bedda-tech/react-native-accessibility-controller/tree/133fdaf0a61044e1c899681391b79f1845c9c2ee). Its package omits compiled JS/declarations, so `postinstall` compiles its TypeScript without changing native code. The postinstall step also enables the Bluetooth dependency's standard AGP-generated BuildConfig metadata, guarded by its exact version and original file hash; it changes no Java/Kotlin adapter source. Its screenshot APIs are not used. The pinned dependency and the security protocol need independent review before a public release.

The prefixed WebRTC AAR contains an unused class-loader customization method that references an omitted generated JNI class. The Expo configuration suppresses only that exact R8 warning (`livekit.org.jni_zero.JniZeroJni`); normal initialization uses the default loader. Release optimization remains enabled. The configuration also overrides dependency labels and disclosures in generated resources so Accessibility settings identify Synced and explain local screen/control sharing correctly.

Source layout: `src/ui` contains the native screens and viewport geometry; `src/core` contains protocol, transport, media and input; `src/controller` coordinates local permissions and session state. The linked-phone logo is maintained as a vector in `assets/logo.svg`.

## Two-emulator integration test

With two booted Android emulators on a shared virtual Wi-Fi network and the built APK:

```sh
ADB=/path/to/adb npm run test:android:dual -- /path/to/app.apk --voice --screen-control
```

The harness drives the public UI on `emulator-5554` and `emulator-5556`: compare codes, approve, save on both devices, disconnect, explicitly receive/reconnect, restart both app processes, then verify the saved connection works and grants remain off. The optional voice stage checks bilateral acceptance, microphone prompts, active signaling, mute and hangup; audio samples are not verified. The optional screen/control stage requires real video and an observed remote Home action. It fails rather than counting isolated emulator NAT or a missing stream as success. Other serials can be set through `HOST_SERIAL` and `CONTROLLER_SERIAL`. Pairing credentials stay in memory; screenshots are refused while invitation or comparison UI is visible. Bluetooth radio and real microphone routing still require physical qualification.
