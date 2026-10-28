# Synced architecture

One Android application serves two roles. The host is the phone being shared; the controller is the phone in your hand. There is one active session per process and no server-side component.

## Modules

| Component | Responsibility |
| --- | --- |
| `App.tsx` | React Native root, safe-area provider, session hook wiring |
| `src/ui/` | TypeScript Connect/Share screens, SVG brand, remote display, local modals |
| `src/controller/useSynced.ts` | Typed state/events, permission disclosures, validated actions, native adapter |
| `MainApplication.java` / `MainActivity.java` | React Native Android host and package registration |
| `core/SyncedModule.java` | Android API bridge, capture activity results, session-tagged JS events |
| `core/SessionEngine.java` | Authenticated local session, socket lifecycle, host approval, input gates |
| `core/Invitation.java` | Local-address validation, private invitation and expiry |
| `core/Pairing.java` | Authenticated challenge/proof, matching code, host approval |
| `core/Crypto.java` / `PacketCipher.java` | AES-GCM, directional keys and strict sequence numbers |
| `core/Framing.java` / `SecureChannel.java` | Bounded length framing, authenticated message types |
| `capture/ScreenCaptureService.java` | Foreground full-display capture, JPEG pipeline and teardown |
| `control/RemoteControlService.java` | Host-enabled gestures, text, navigation and clock intents |

The interface and application adapter are TypeScript. Java implements the Android capabilities that React Native cannot supply through JavaScript alone. No authored Kotlin application source is present.

## Session sequence

