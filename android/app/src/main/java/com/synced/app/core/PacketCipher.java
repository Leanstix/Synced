package com.synced.app.core;

import java.nio.ByteBuffer;
import java.security.GeneralSecurityException;
import java.util.Arrays;
import javax.crypto.Cipher;

/** Directional connection keys and authenticated monotonic counters prevent replay. */
public final class PacketCipher {
    public static final int MAX_PLAIN_BYTES = 2 * 1024 * 1024;
    public static final int MAX_PACKET_BYTES = MAX_PLAIN_BYTES + 24;
    private final byte[] key;
    private long nextSend, nextReceive;
    public PacketCipher(byte[] key) { this.key = key.clone(); }
    public synchronized byte[] encrypt(byte[] plain) throws GeneralSecurityException {
        if (plain.length > MAX_PLAIN_BYTES) throw new IllegalArgumentException("Packet too large");
        if (nextSend == Long.MAX_VALUE) throw new IllegalStateException("Session exhausted");
        byte[] sequence = ByteBuffer.allocate(8).putLong(nextSend++).array();
        return Crypto.join(sequence, Crypto.crypt(Cipher.ENCRYPT_MODE, key, Crypto.join(new byte[4], sequence), plain, sequence));
    }
    public synchronized byte[] decrypt(byte[] packet) throws GeneralSecurityException {
        if (packet.length < 24 || packet.length > MAX_PACKET_BYTES) throw new IllegalArgumentException("Invalid packet size");
        byte[] sequence = Arrays.copyOfRange(packet, 0, 8);
        if (ByteBuffer.wrap(sequence).getLong() != nextReceive) throw new IllegalArgumentException("Out-of-order or replayed packet");
        byte[] plain = Crypto.crypt(Cipher.DECRYPT_MODE, key, Crypto.join(new byte[4], sequence), Arrays.copyOfRange(packet, 8, packet.length), sequence);
        nextReceive++; return plain;
    }
}
