# Post-push device qualification record

**Status: pending.** The owner builds and tests after the final push. Do not delay the push to collect phone models or signing credentials. Fill this record with actual observations from the EAS preview APK, then repeat the critical path from a Play internal-testing installation of the production bundle.

Record the source commit, EAS build URL, APK/AAB hash, version code, certificate fingerprint, Android versions, OEMs, device roles and transport used. Do not record invitation secrets, comparison codes, typed private text or microphone recordings. Use test accounts and harmless sample text.

| Feature | At least five physical edge checks | Evidence / result |
| --- | --- | --- |
| Nearby Bluetooth | deny scan/connect permission; deny advertising permission; Bluetooth off; permission later revoked; move out of range during session; reject an unapproved peer | Pending |
| Pairing and approval | mismatched comparison codes; expired invitation; replay prior invitation/proof; cancel pending connection; second peer while one is active; disconnect before approval resolves | Pending |
| LAN fallback | no private interface; Wi-Fi lost mid-session; reconnect after drop; switch hotspot/subnet; peer closes mid-frame; screen/control traffic cannot cross an unapproved session | Pending |
| Screen capture | cancel Android consent; grant after disconnect; rotate host; stop from system sharing notification; lock screen; disconnect while negotiating | Pending |
| Explicit remote control | deny Accessibility; revoke while action pending; disable local control; enter System UI/password/payment screen; host background/lock; stale controller input after stop | Pending |
| Blind control and visible actions | no capture does not bypass explicit grant; grant revoked during action; protected foreground app; malformed action; disconnection; navigation/alarm/dialer UI stays within local authorization | Pending |
| Voice intercom | deny microphone; accept/reject request; stop from either peer; disconnect; app backgrounds; change audio route/headset; permission revoked while active | Pending |
| Resource recovery | rapid connect/disconnect; consent dialog resolves after disconnect; app unmount/relaunch; radio toggled; peer process killed; repeated media failure followed by fresh approved session | Pending |

For each case record expected behavior, observed behavior, pass/fail, and a short evidence reference. Never mark a category passed solely because its happy path worked. Unit tests simulate peer events and permission races; they cannot establish Android service lifecycle, OEM Accessibility behavior, headset routing, Bluetooth MTU or radio behavior.

On a failure, stop the session locally, confirm capture/microphone/control are no longer active, retain minimized diagnostics, and file a reproducible case with the build commit. Avoid collecting full logcat or accessibility trees from personal apps. `redact-release-log.mts` reduces accidental secrets and addresses but does not prove a log or screenshot is safe to share; review evidence before uploading.

Before distribution beyond internal testing, verify all of: no default debug certificate in the production bundle; no unreviewed permissions; valid privacy disclosures for screen capture, Accessibility, Bluetooth and microphone; the stop path works from either peer; no residual microphone/capture after background or disconnect; and the critical path works on both device roles. Record actual results and unresolved limitations instead of signing off pending rows.
