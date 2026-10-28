package com.synced.app.core;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;

public final class Framing {
    private Framing() {}
    public static byte[] read(DataInputStream input) throws IOException { return read(input, PacketCipher.MAX_PACKET_BYTES); }
    public static byte[] read(DataInputStream input, int maximum) throws IOException {
