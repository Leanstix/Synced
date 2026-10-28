package com.synced.app.core;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** The out-of-band invitation secret never crosses the network. */
public final class Crypto {
    private static final SecureRandom RANDOM = new SecureRandom();
    private Crypto() {}
    public static byte[] random(int size) { byte[] bytes = new byte[size]; RANDOM.nextBytes(bytes); return bytes; }
    public static byte[] join(byte[] first, byte[] second) {
        byte[] result = Arrays.copyOf(first, first.length + second.length);
        System.arraycopy(second, 0, result, first.length, second.length); return result;
    }
    public static byte[] seal(byte[] key, byte[] plain) throws GeneralSecurityException {
        byte[] nonce = random(12);
