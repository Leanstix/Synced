# Synced milestones

## Local Android preview

Intentional invitations, per-session host approval, encrypted local transport, explicit screen-capture consent, optional accessibility control, visible stop/disconnect, and honest failure states. This is the current implementation scope.

## Before calling this reliable

- Complete the two-physical-phone matrix, including Samsung, Pixel, Xiaomi, Tecno, Infinix, and hotspot hosting in both directions.
- Independently review the application protocol and threat model; prefer an audited standard transport before public distribution.
- Replace the JPEG preview transport with a measured video pipeline, retain bounded queues, and benchmark latency/battery usage.
- Verify Android 16 and newer behavior, background execution, OEM battery management, orientation, and full-screen consent.
- Harden accessibility handling for keyboards, app transitions, display insets, password fields, and secure windows.
- Confirm Google Play accessibility policy eligibility, disclosures, and declarations before store submission.
- Complete a real-device accessibility, screen-reader, large-font, and contrast audit.

## Trusted device product

Use Android Keystore-backed identity keys, a reviewed pairing exchange, host-confirmed verification, encrypted storage, a device list with individual revocation, key rotation, and explicit permission scopes. Persistent pairing must not imply permission to bypass screen-capture consent or device authentication.

## More connection options

Add QR invitations and optional local discovery after permission review. Explore Bluetooth for pairing and small control messages; screen video should use Wi-Fi or a measured alternative. Add internet access only with a separate authenticated signaling/relay design, clear account recovery, and revocation behavior.

