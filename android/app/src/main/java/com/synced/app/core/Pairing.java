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
        long number = ByteBuffer.wrap(Crypto.derive(secret, client, host, "verification code")).getInt() & 0xffffffffL;
        return String.format(Locale.ROOT, "%06d", number % 1_000_000);
    }
    public static Result host(Socket socket, byte[] secret, Approval approve) throws Exception {
        JSONObject hello = receive(socket, secret);
        if (!"hello".equals(hello.getString("type")) || hello.getInt("version") != 1) throw new IllegalArgumentException("Invalid handshake");
        byte[] client = nonce(hello, "nonce"), host = Crypto.random(32); String peer = clean(hello.getString("name"));
        send(socket, secret, new JSONObject().put("type", "challenge").put("client", Invitation.encodeBytes(client)).put("host", Invitation.encodeBytes(host)).put("name", name()));
        JSONObject proof = receive(socket, secret);
        if (!"proof".equals(proof.getString("type")) || !MessageDigest.isEqual(nonce(proof, "host"), host)) throw new IllegalArgumentException("Invalid proof");
        SecureChannel channel = new SecureChannel(socket, Crypto.derive(secret, client, host, "host to controller"), Crypto.derive(secret, client, host, "controller to host"));
        if (!approve.approve(peer + " · code " + verification(secret, client, host))) throw new IllegalArgumentException("Connection declined or approval expired.");
        channel.send(SecureChannel.STATUS, new JSONObject().put("approved", true).put("name", name()).toString().getBytes(StandardCharsets.UTF_8));
        return new Result(channel, peer);
    }
    public static Result controller(Socket socket, byte[] secret, Code show) throws Exception {
        byte[] client = Crypto.random(32);
        send(socket, secret, new JSONObject().put("type", "hello").put("version", 1).put("nonce", Invitation.encodeBytes(client)).put("name", name()));
        JSONObject challenge = receive(socket, secret);
        if (!"challenge".equals(challenge.getString("type")) || !MessageDigest.isEqual(nonce(challenge, "client"), client)) throw new IllegalArgumentException("Invalid challenge");
        byte[] host = nonce(challenge, "host");
        send(socket, secret, new JSONObject().put("type", "proof").put("host", Invitation.encodeBytes(host)));
