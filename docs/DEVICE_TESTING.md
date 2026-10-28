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

