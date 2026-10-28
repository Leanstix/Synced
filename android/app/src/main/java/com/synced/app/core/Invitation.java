package com.synced.app.core;

import org.json.JSONObject;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/** Entire invitation is a bearer secret: never log or persist it. */
public final class Invitation {
    public final String host; public final int port; public final byte[] secret; public final long expires;
    public Invitation(String host, int port, byte[] secret, long expires) { this.host = host; this.port = port; this.secret = secret.clone(); this.expires = expires; }
    public static String encodeBytes(byte[] bytes) { return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }
    public static byte[] decodeBytes(String text) { return Base64.getUrlDecoder().decode(text); }
    public String encode() throws Exception {
