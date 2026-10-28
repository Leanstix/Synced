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
