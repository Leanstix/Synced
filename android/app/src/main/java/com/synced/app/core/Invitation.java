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
        return "synced1:" + encodeBytes(new JSONObject().put("host", host).put("port", port).put("key", encodeBytes(secret)).put("expires", expires).toString().getBytes(StandardCharsets.UTF_8));
    }
    public static Invitation parse(String value) throws Exception {
        String text = value.trim();
        if (!text.startsWith("synced1:") || text.length() > 4096) throw new IllegalArgumentException("Paste the complete Synced invitation.");
        JSONObject data = new JSONObject(new String(decodeBytes(text.substring(8)), StandardCharsets.UTF_8));
        String host = data.getString("host");
        if (!host.matches("[0-9.]{7,15}")) throw new IllegalArgumentException("Use a local IPv4 address.");
        InetAddress address = InetAddress.getByName(host);
