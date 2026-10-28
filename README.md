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

