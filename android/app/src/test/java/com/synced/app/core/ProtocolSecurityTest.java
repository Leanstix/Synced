package com.synced.app.core;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.util.concurrent.TimeUnit;
import javax.crypto.AEADBadTagException;

public class ProtocolSecurityTest {
    private final byte[] secret = bytes(0), client = bytes(32), host = bytes(64);
