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
