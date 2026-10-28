package com.synced.app.core;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.net.Socket;
import java.util.Arrays;

public final class SecureChannel {
    public static final int FRAME = 1, CONTROL = 2, STATUS = 3, PING = 4;
    private final DataInputStream input;
    private final DataOutputStream output;
    private final PacketCipher sender, receiver;
    public SecureChannel(Socket socket, byte[] sendKey, byte[] receiveKey) throws Exception {
        input = new DataInputStream(socket.getInputStream()); output = new DataOutputStream(socket.getOutputStream());
        sender = new PacketCipher(sendKey); receiver = new PacketCipher(receiveKey);
    }
    public synchronized void send(int type, byte[] body) throws Exception {
        Framing.write(output, sender.encrypt(Crypto.join(new byte[] {(byte) type}, body)));
    }
    public Message read() throws Exception {
        byte[] plain = receiver.decrypt(Framing.read(input));
        if (plain.length == 0) throw new IllegalArgumentException("Empty message");
        return new Message(plain[0] & 255, Arrays.copyOfRange(plain, 1, plain.length));
    }
    public static final class Message {
        public final int type; public final byte[] body;
        public Message(int type, byte[] body) { this.type = type; this.body = body; }
    }
}
