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
