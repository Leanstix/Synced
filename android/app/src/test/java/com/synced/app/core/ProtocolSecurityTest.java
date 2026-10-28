package com.synced.app.core;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.util.concurrent.TimeUnit;
import javax.crypto.AEADBadTagException;

public class ProtocolSecurityTest {
    private final byte[] secret = bytes(0), client = bytes(32), host = bytes(64);
    private static byte[] bytes(int offset) { byte[] result = new byte[32]; for (int i = 0; i < 32; i++) result[i] = (byte) (i + offset); return result; }
    @Test public void encryptedHandshakeRoundTrip() throws Exception { byte[] data = "private proof".getBytes(); assertArrayEquals(data, Crypto.open(secret, Crypto.seal(secret, data))); }
    @Test public void handshakeUsesFreshNonce() throws Exception { assertFalse(java.util.Arrays.equals(Crypto.seal(secret, new byte[] {1}), Crypto.seal(secret, new byte[] {1}))); }
    @Test public void wrongInvitationCannotAuthenticate() throws Exception { byte[] encrypted = Crypto.seal(secret, new byte[] {1}); assertThrows(AEADBadTagException.class, () -> Crypto.open(bytes(1), encrypted)); }
