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
    @Test public void handshakeTamperFails() throws Exception { byte[] encrypted = Crypto.seal(secret, new byte[] {1}); encrypted[encrypted.length - 1] ^= 1; assertThrows(AEADBadTagException.class, () -> Crypto.open(secret, encrypted)); }
    @Test public void directionalKeysDiffer() throws Exception { assertFalse(java.util.Arrays.equals(Crypto.derive(secret, client, host, "host to controller"), Crypto.derive(secret, client, host, "controller to host"))); }
    @Test public void freshConnectionKeysDiffer() throws Exception { assertFalse(java.util.Arrays.equals(Crypto.derive(secret, client, host, "host to controller"), Crypto.derive(secret, client, bytes(2), "host to controller"))); }
    @Test public void orderedPacketsRoundTrip() throws Exception {
        PacketCipher send = new PacketCipher(secret), receive = new PacketCipher(secret);
        for (int i = 0; i < 4; i++) assertArrayEquals(new byte[] {(byte) i}, receive.decrypt(send.encrypt(new byte[] {(byte) i})));
    }
    @Test public void replayRejected() throws Exception { PacketCipher receive = new PacketCipher(secret); byte[] packet = new PacketCipher(secret).encrypt(new byte[] {1}); receive.decrypt(packet); assertThrows(IllegalArgumentException.class, () -> receive.decrypt(packet)); }
    @Test public void reorderedPacketRejected() throws Exception { PacketCipher send = new PacketCipher(secret); send.encrypt(new byte[] {1}); byte[] second = send.encrypt(new byte[] {2}); assertThrows(IllegalArgumentException.class, () -> new PacketCipher(secret).decrypt(second)); }
    @Test public void tamperedPayloadRejected() throws Exception { byte[] packet = new PacketCipher(secret).encrypt(new byte[] {1}); packet[packet.length - 1] ^= 1; assertThrows(AEADBadTagException.class, () -> new PacketCipher(secret).decrypt(packet)); }
    @Test public void failedAuthenticationDoesNotAdvanceCounter() throws Exception {
        PacketCipher receive = new PacketCipher(secret); byte[] packet = new PacketCipher(secret).encrypt(new byte[] {8}), broken = packet.clone(); broken[broken.length - 1] ^= 1;
        assertThrows(AEADBadTagException.class, () -> receive.decrypt(broken)); assertArrayEquals(new byte[] {8}, receive.decrypt(packet));
    }
    @Test public void oversizedPlaintextRejected() { assertThrows(IllegalArgumentException.class, () -> new PacketCipher(secret).encrypt(new byte[PacketCipher.MAX_PLAIN_BYTES + 1])); }
    @Test public void truncatedCiphertextRejected() { assertThrows(IllegalArgumentException.class, () -> new PacketCipher(secret).decrypt(new byte[23])); }
    private DataInputStream length(int size) throws Exception { ByteArrayOutputStream data = new ByteArrayOutputStream(); new DataOutputStream(data).writeInt(size); return new DataInputStream(new ByteArrayInputStream(data.toByteArray())); }
    @Test public void framingRoundTrip() throws Exception { ByteArrayOutputStream data = new ByteArrayOutputStream(); Framing.write(new DataOutputStream(data), new byte[] {1, 2}); assertArrayEquals(new byte[] {1, 2}, Framing.read(new DataInputStream(new ByteArrayInputStream(data.toByteArray())))); }
