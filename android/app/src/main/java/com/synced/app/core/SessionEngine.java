package com.synced.app.core;

import android.content.Context;
import android.content.Intent;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import com.synced.app.capture.ScreenCaptureService;
import com.synced.app.control.RemoteControlService;
import org.json.JSONObject;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.function.Consumer;

/** Android transport/platform adapter. No credentials, typed text or frames are persisted. */
public final class SessionEngine {
    public interface Listener { void onState(JSONObject state); void onFrame(int sessionId, byte[] jpeg); }
    private static volatile SessionEngine instance;
    public static synchronized SessionEngine get(Context context) {
        if (instance == null) instance = new SessionEngine(context.getApplicationContext()); return instance;
    }
    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService workers = Executors.newCachedThreadPool();
    private final ThreadPoolExecutor writer = new ThreadPoolExecutor(1, 1, 0, TimeUnit.SECONDS, new ArrayBlockingQueue<>(32));
    private final ScheduledExecutorService heartbeat = Executors.newSingleThreadScheduledExecutor();
    private final AtomicInteger generation = new AtomicInteger(), controlEpoch = new AtomicInteger(), pendingCommands = new AtomicInteger();
    private final AtomicBoolean frameBusy = new AtomicBoolean(), uiQueued = new AtomicBoolean(), frameUiQueued = new AtomicBoolean();
    private final AtomicReference<PendingFrame> latestFrame = new AtomicReference<>();
    private static final class PendingFrame {
        final int generation; final byte[] jpeg;
        PendingFrame(int generation, byte[] jpeg) { this.generation = generation; this.jpeg = jpeg; }
    }
    private final State state = new State();
    private volatile Listener listener;
    private volatile Socket socket;
    private volatile ServerSocket server;
    private volatile SecureChannel channel;
    private volatile ApprovalGate approval;
    private volatile boolean authenticated, controlConsent;
    private SessionEngine(Context context) {
