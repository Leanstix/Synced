package com.synced.app.core;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;

public final class Framing {
    private Framing() {}
    public static byte[] read(DataInputStream input) throws IOException { return read(input, PacketCipher.MAX_PACKET_BYTES); }
    public static byte[] read(DataInputStream input, int maximum) throws IOException {
        int size = input.readInt();
        if (size < 1 || size > maximum) throw new IllegalArgumentException("Invalid frame length");
        byte[] body = new byte[size]; input.readFully(body); return body;
    }
    public static void write(DataOutputStream output, byte[] data) throws IOException { write(output, data, PacketCipher.MAX_PACKET_BYTES); }
    public static void write(DataOutputStream output, byte[] data, int maximum) throws IOException {
        if (data.length < 1 || data.length > maximum) throw new IllegalArgumentException("Invalid frame length");
        output.writeInt(data.length); output.write(data); output.flush();
    }
}
