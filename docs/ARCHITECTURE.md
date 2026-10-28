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

1. The host obtains a private local address, listens on an ephemeral TCP port, and generates a short-lived invitation.
2. The controller validates the invitation and opens a direct TCP connection.
3. An encrypted hello contains the controller's random nonce and display name.
4. An encrypted challenge echoes that nonce and adds the host's fresh nonce.
5. The controller authenticates the host's challenge and returns proof of the host nonce.
6. The host displays the request and waits for local approval. It does not send screen data before approval.
7. Both sides derive separate directional session keys; the host sends an authenticated approval status.
8. The host separately starts Android screen sharing. Optional remote input requires accessibility and explicit control consent.
9. Either side can end the connection. Capture termination revokes control.

