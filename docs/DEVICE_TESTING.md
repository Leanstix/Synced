# Two-phone acceptance checks

These are manual acceptance cases, not claims of completed physical-device tests. Record device model, Android build, clock app/version, network topology, APK commit, expected behavior, actual behavior, and evidence for each run. Never capture an invitation secret in a shared report.

## Pairing and consent

1. Fresh installation shows no fake paired devices or connection metrics.
2. Sharing creates an invitation; starting a second role cannot leave an old listener active.
3. A malformed invitation shows an actionable error without crashing.
4. An invitation with a wrong secret cannot establish authenticated access.
5. A connection request does not show frames or execute input before host approval.
6. Rejection disconnects the requester and leaves the host usable.
7. Approval alone does not bypass Android screen-capture consent.
8. Cancelling the Android capture dialog leaves a recoverable session.
9. The host can stop from the app and the persistent capture notification.
10. Reconnecting requires fresh host approval; stale secrets and old sockets cannot regain control.

## Screen and gestures

11. Entire-screen capture displays a real current frame on the controller.
12. An app-only selection is rejected or cannot enable mismatched full-display control.
13. Portrait and landscape frames fit without stretching; letterbox regions ignore touches.
14. Tapping each display corner hits the expected remote target.
15. A short tap remains a tap, a long press retains duration, and a swipe follows the expected path.
16. Back, Home, and Recents run only after control is enabled on the host.
17. Disabling the host's control switch immediately rejects new input.
18. Disabling the accessibility service makes control unavailable without affecting local use.
19. Text reaches the focused editable field; it does not send a message automatically.
20. Password and secure windows follow Android/app protection; Synced does not remove those protections.

## Alarm scenario

21. Open clock from the controller and create a test alarm through its remote UI.
22. Run a test alarm while the approved session remains active and unlocked.
23. Request dismiss and snooze separately; verify the clock's actual state rather than a success label.
24. Repeat with multiple alarms, a third-party clock, and no clock handler installed.
25. Lock the host and document what happens; do not assume unattended alarm dismissal works.
26. Keep the controller on the host's hotspot and repeat; reverse host/controller roles.

## Lifecycle and network

