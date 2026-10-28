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
        this.context = context;
        heartbeat.scheduleWithFixedDelay(() -> { if (authenticated) sendPacket(SecureChannel.PING, new byte[0]); }, 5, 5, TimeUnit.SECONDS);
    }
    private static final class State {
        String role = "IDLE", status = "Ready for a connection you approve.", invitation = "", addresses = "", pendingPeer, peerName = "", error;
        boolean connected, capturing, accessibilityEnabled, controlAllowed;
        JSONObject json() {
            try { return new JSONObject().put("role", role).put("status", status).put("invitation", invitation).put("addresses", addresses)
                .put("pendingPeer", pendingPeer == null ? JSONObject.NULL : pendingPeer).put("peerName", peerName)
                .put("error", error == null ? JSONObject.NULL : error).put("connected", connected).put("capturing", capturing)
                .put("accessibilityEnabled", accessibilityEnabled).put("controlAllowed", controlAllowed);
            } catch (Exception e) { throw new IllegalStateException(e); }
        }
    }
    public synchronized JSONObject snapshot() {
        JSONObject json = state.json();
        try { json.put("_sessionId", generation()); } catch (Exception ignored) {}
        return json;
    }
    public void setListener(Listener value) { listener = value; publish(); }
    public synchronized void clearListener(Listener value) { if (listener == value) listener = null; }
    private synchronized void update(Consumer<State> change) { change.accept(state); publish(); }
    private void publish() {
        if (uiQueued.compareAndSet(false, true)) main.post(() -> {
            uiQueued.set(false); Listener target = listener; if (target != null) target.onState(snapshot());
        });
    }
    private synchronized void update(int id, Consumer<State> change) { if (current(id)) update(change); }
    public int generation() { return generation.get(); }
    private boolean current(int id) { return generation.get() == id; }
    public synchronized boolean isHostReady() { return "HOST".equals(state.role) && state.connected && !state.capturing; }
    public synchronized boolean isCapturing() { return state.capturing && authenticated && "HOST".equals(state.role); }
    public synchronized boolean canControl() { return authenticated && controlConsent && state.capturing && "HOST".equals(state.role); }
    public void report(String message) { update(s -> { s.status = message; s.error = message; }); }
    public synchronized void report(int id, String message) { if (current(id)) report(message); }
    public synchronized void refreshAccessibility() {
        if ("CONTROLLER".equals(state.role)) return;
        update(s -> s.accessibilityEnabled = RemoteControlService.instance != null); sendStatus();
    }
    public synchronized void disconnect(String message) {
        generation.incrementAndGet(); latestFrame.set(null); authenticated = false; controlConsent = false; controlEpoch.incrementAndGet();
        if (approval != null) approval.resolve(false); approval = null;
        close(socket); socket = null; close(server); server = null; channel = null;
        context.stopService(new Intent(context, ScreenCaptureService.class));
        update(s -> {
            s.role = "IDLE"; s.status = message; s.invitation = ""; s.addresses = ""; s.pendingPeer = null; s.peerName = ""; s.error = null;
            s.connected = false; s.capturing = false; s.controlAllowed = false; s.accessibilityEnabled = RemoteControlService.instance != null;
        });
    }
    public synchronized void disconnect(int id, String message) { if (current(id)) disconnect(message); }
    private static void close(java.io.Closeable object) { if (object != null) try { object.close(); } catch (Exception ignored) {} }
