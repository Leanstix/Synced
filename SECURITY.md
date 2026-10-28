# Synced security model

Synced's first release is a development preview for owner-authorized Android-to-Android use on a local network. It has not received an independent security audit. Do not treat an encrypted connection as evidence that the full application or protocol is production-ready.

## Authorization boundaries

An invitation contains a randomly generated 256-bit bearer secret and expires after ten minutes. Anyone holding it can request a connection, so transfer it privately. Device names are supplied by the peer and are not verified identities. The host must deliberately approve the intended phone.

Host approval is separate from Android's screen-capture consent and the session's remote-control switch. The accessibility service must also be enabled by the host in Android settings. Capture, accessibility, and control are distinct gates; an enabled accessibility service alone does not authorize a peer.

Pairing is session-scoped. Credentials, captured frames, and typed text are not written to app storage. Android process death removes the session. A future trusted-device implementation needs its own reviewed identity and revocation design.

## Transport

Protocol v1 uses AES-256-GCM and a random invitation secret. Authentication messages use fresh 96-bit nonces. The peers exchange fresh 256-bit nonces inside authenticated handshake messages, then derive separate traffic keys for each direction using HMAC-SHA256 extract/expand operations with labeled context. The host's fresh challenge prevents replayed authentication proofs from approving an old connection.

Each encrypted traffic packet authenticates an eight-byte sequence number. A per-direction counter supplies the GCM nonce and must match exactly on receipt. Reordered, repeated, modified, truncated, and oversized packets are rejected. Packet lengths are bounded before allocation; decoded image dimensions are also checked before full bitmap decode.

