package com.synced.app.core;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.DataOutputStream;
import java.net.*;
import java.util.concurrent.*;

public class SecureChannelIntegrationTest {
    private static final class Sockets implements AutoCloseable {
        final ServerSocket listener = new ServerSocket(0);
        final Socket client = new Socket("127.0.0.1", listener.getLocalPort());
        final Socket host = listener.accept();
        Sockets() throws Exception { client.setSoTimeout(2000); host.setSoTimeout(2000); }
        @Override public void close() throws Exception { client.close(); host.close(); listener.close(); }
    }
    @Test public void framesAndCommandsCrossRealSocket() throws Exception {
        byte[] outbound = Crypto.random(32), inbound = Crypto.random(32);
        try (Sockets sockets = new Sockets()) {
            SecureChannel host = new SecureChannel(sockets.host, outbound, inbound), client = new SecureChannel(sockets.client, inbound, outbound);
            host.send(SecureChannel.STATUS, new byte[] {1}); assertEquals(SecureChannel.STATUS, client.read().type);
            client.send(SecureChannel.CONTROL, "back".getBytes()); assertEquals("back", new String(host.read().body));
            host.send(SecureChannel.FRAME, new byte[] {4, 5, 6}); assertArrayEquals(new byte[] {4, 5, 6}, client.read().body);
        }
    }
    @Test public void wrongDirectionalKeyFailsOnRealSocket() throws Exception {
        try (Sockets sockets = new Sockets()) {
            byte[] key = Crypto.random(32); SecureChannel host = new SecureChannel(sockets.host, key, key), client = new SecureChannel(sockets.client, key, Crypto.random(32));
            host.send(SecureChannel.STATUS, new byte[] {1}); assertThrows(javax.crypto.AEADBadTagException.class, client::read);
        }
    }
    @Test public void replayedSocketPacketFails() throws Exception {
        try (Sockets sockets = new Sockets()) {
            byte[] key = Crypto.random(32), packet = new PacketCipher(key).encrypt(new byte[] {SecureChannel.STATUS, 1});
            DataOutputStream output = new DataOutputStream(sockets.host.getOutputStream()); SecureChannel client = new SecureChannel(sockets.client, key, key);
            Framing.write(output, packet); client.read(); Framing.write(output, packet); assertThrows(IllegalArgumentException.class, client::read);
        }
    }
    @Test public void maliciousNetworkLengthFailsBeforeAllocation() throws Exception {
        try (Sockets sockets = new Sockets()) {
            byte[] key = Crypto.random(32); new DataOutputStream(sockets.host.getOutputStream()).writeInt(Integer.MAX_VALUE);
