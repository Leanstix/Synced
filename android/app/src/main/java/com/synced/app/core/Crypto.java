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
        return join(nonce, crypt(Cipher.ENCRYPT_MODE, key, nonce, plain, "Synced handshake v1".getBytes(StandardCharsets.UTF_8)));
    }
    public static byte[] open(byte[] key, byte[] sealed) throws GeneralSecurityException {
        if (sealed.length < 28) throw new IllegalArgumentException("Truncated authentication packet");
        return crypt(Cipher.DECRYPT_MODE, key, Arrays.copyOfRange(sealed, 0, 12), Arrays.copyOfRange(sealed, 12, sealed.length), "Synced handshake v1".getBytes(StandardCharsets.UTF_8));
    }
    public static byte[] derive(byte[] secret, byte[] client, byte[] host, String direction) throws GeneralSecurityException {
        if (secret.length != 32 || client.length != 32 || host.length != 32) throw new IllegalArgumentException("Invalid key material");
        byte[] extract = hmac(join(client, host), secret);
        return hmac(extract, join(("Synced v1 " + direction).getBytes(StandardCharsets.UTF_8), new byte[] {1}));
    }
    private static byte[] hmac(byte[] key, byte[] data) throws GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(key, "HmacSHA256")); return mac.doFinal(data);
    }
    static byte[] crypt(int mode, byte[] key, byte[] nonce, byte[] data, byte[] aad) throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(mode, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, nonce)); cipher.updateAAD(aad); return cipher.doFinal(data);
    }
}
