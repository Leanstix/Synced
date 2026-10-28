package com.synced.app.core;

import android.os.Build;
import org.json.JSONObject;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.net.Socket;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;

public final class Pairing {
    private static final int MAX_HANDSHAKE = 4096;
    private Pairing() {}
    public interface Approval { boolean approve(String name) throws Exception; }
    public interface Code { void show(String code); }
    public static final class Result {
        public final SecureChannel channel; public final String peer;
        Result(SecureChannel channel, String peer) { this.channel = channel; this.peer = peer; }
    }
    private static void send(Socket socket, byte[] secret, JSONObject json) throws Exception {
        Framing.write(new DataOutputStream(socket.getOutputStream()), Crypto.seal(secret, json.toString().getBytes(StandardCharsets.UTF_8)), MAX_HANDSHAKE);
    }
    private static JSONObject receive(Socket socket, byte[] secret) throws Exception {
        return new JSONObject(new String(Crypto.open(secret, Framing.read(new DataInputStream(socket.getInputStream()), MAX_HANDSHAKE)), StandardCharsets.UTF_8));
    }
    private static byte[] nonce(JSONObject json, String name) throws Exception {
        byte[] bytes = Invitation.decodeBytes(json.getString(name));
        if (bytes.length != 32) throw new IllegalArgumentException("Invalid handshake nonce"); return bytes;
    }
    private static String name() { return clean(Build.MANUFACTURER + " " + Build.MODEL); }
    private static String clean(String name) { return name.replaceAll("\\p{Cntrl}", "").substring(0, Math.min(name.replaceAll("\\p{Cntrl}", "").length(), 80)); }
    private static String verification(byte[] secret, byte[] client, byte[] host) throws Exception {
