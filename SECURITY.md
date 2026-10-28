# Synced security model

Synced's first release is a development preview for owner-authorized Android-to-Android use on a local network. It has not received an independent security audit. Do not treat an encrypted connection as evidence that the full application or protocol is production-ready.

## Authorization boundaries

An invitation contains a randomly generated 256-bit bearer secret and expires after ten minutes. Anyone holding it can request a connection, so transfer it privately. Device names are supplied by the peer and are not verified identities. The host must deliberately approve the intended phone.

