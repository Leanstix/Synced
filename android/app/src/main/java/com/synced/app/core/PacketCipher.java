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
