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
