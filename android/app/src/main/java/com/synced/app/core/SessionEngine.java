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
    private synchronized boolean claim(int id, Socket value) { if (!current(id)) { close(value); return false; } socket = value; return true; }
    private synchronized boolean claim(int id, ServerSocket value) { if (!current(id)) { close(value); return false; } server = value; return true; }
    private synchronized boolean activate(int id, SecureChannel value) { if (!current(id)) return false; channel = value; authenticated = true; return true; }
    public void startHosting() {
        disconnect("Creating a private local invitation…"); int id = generation();
        update(id, s -> { s.role = "HOST"; s.error = null; });
        workers.execute(() -> {
            try {
                List<NetworkInterface> interfaces = Collections.list(NetworkInterface.getNetworkInterfaces());
                interfaces.sort(Comparator.comparingInt(n -> n.getName().startsWith("wlan") || n.getName().startsWith("ap") || n.getName().startsWith("swlan") ? 0 : 1));
                List<String> addresses = new ArrayList<>();
                for (NetworkInterface net : interfaces) if (net.isUp() && !net.isLoopback()) {
                    for (InetAddress address : Collections.list(net.getInetAddresses())) if (address instanceof Inet4Address && (address.isSiteLocalAddress() || address.isLinkLocalAddress())) addresses.add(address.getHostAddress());
                }
                if (addresses.isEmpty()) throw new IllegalArgumentException("Connect both phones to the same Wi-Fi or enable a phone's hotspot first.");
                ServerSocket local = new ServerSocket(0); local.setSoTimeout(1000); if (!claim(id, local)) return;
                byte[] secret = Crypto.random(32); long expiry = System.currentTimeMillis() + 10 * 60_000;
                String invitation = new Invitation(addresses.get(0), local.getLocalPort(), secret, expiry).encode();
                update(id, s -> { s.invitation = invitation; s.addresses = addresses.get(0) + ":" + local.getLocalPort(); s.status = "Invitation ready for 10 minutes. Keep it private; approve the connecting phone here."; });
                while (current(id) && System.currentTimeMillis() < expiry) {
                    Socket peer;
                    try { peer = local.accept(); } catch (SocketTimeoutException ignored) { continue; }
                    if (!claim(id, peer)) return;
                    try {
                        peer.setSoTimeout(12_000); peer.setTcpNoDelay(true);
                        Pairing.Result result = Pairing.host(peer, secret, name -> {
                            ApprovalGate gate = new ApprovalGate();
                            synchronized (this) {
                                if (current(id)) { approval = gate; update(id, s -> { s.pendingPeer = name; s.status = "Compare this code with the connecting phone before approving."; }); }
                                else gate.resolve(false);
                            }
                            boolean allowed = gate.await(90, TimeUnit.SECONDS);
                            synchronized (this) { if (approval == gate) approval = null; return current(id) && allowed && System.currentTimeMillis() < expiry; }
                        });
                        if (!current(id)) { close(peer); return; }
                        close(local); synchronized (this) { if (current(id)) server = null; }
                        if (!activate(id, result.channel)) { close(peer); return; }
                        peer.setSoTimeout(15_000);
                        update(id, s -> { s.connected = true; s.pendingPeer = null; s.invitation = ""; s.peerName = result.peer; s.status = "Phone approved. Start screen sharing when you are ready."; s.error = null; });
                        sendStatus(); receiveHost(id, result.channel); return;
                    } catch (Exception e) {
                        close(peer);
                        update(id, s -> { s.pendingPeer = null; s.status = "Connection declined or authentication failed. Share the invitation only with your intended phone."; });
                    }
                }
                disconnect(id, "Invitation expired. Create a new invitation to host.");
            } catch (Exception e) { disconnect(id, "Could not host: " + friendly(e)); }
        });
    }
    public synchronized void approve(boolean allow) {
        if (approval == null) return; approval.resolve(allow);
        update(s -> { s.pendingPeer = null; s.status = allow ? "Phone approved. Establishing encrypted session…" : "Connection declined."; });
    }
    public void connect(String invitation) {
        disconnect("Connecting securely. Approve this phone on the host…"); int id = generation(); update(id, s -> s.role = "CONTROLLER");
        workers.execute(() -> {
            try {
                Invitation invite = Invitation.parse(invitation); Socket client = new Socket(); if (!claim(id, client)) return;
                client.connect(new InetSocketAddress(invite.host, invite.port), 8000); client.setSoTimeout(100_000); client.setTcpNoDelay(true);
                Pairing.Result result = Pairing.controller(client, invite.secret, code -> update(id, s -> s.status = "Pairing code " + code + " · Compare on the host, then approve there."));
                if (!activate(id, result.channel)) { close(client); return; } client.setSoTimeout(15_000);
                update(id, s -> { s.connected = true; s.peerName = result.peer; s.status = "Connected. Waiting for the host to start screen sharing."; s.error = null; });
                receiveController(id, result.channel);
            } catch (Exception e) { disconnect(id, "Connection ended: " + friendly(e)); }
        });
    }
    private void receiveHost(int id, SecureChannel secure) {
        long window = System.nanoTime(); int commands = 0;
        try {
            while (current(id)) {
                SecureChannel.Message message = secure.read();
                if (message.type == SecureChannel.PING) { if (message.body.length != 0) throw new IllegalArgumentException("Invalid heartbeat"); continue; }
                if (message.type != SecureChannel.CONTROL || message.body.length > 8192) throw new IllegalArgumentException("Unexpected command");
                long now = System.nanoTime(); if (now - window > 1_000_000_000L) { window = now; commands = 0; }
                if (++commands > 30) throw new IllegalArgumentException("Command rate exceeded");
                JSONObject command = new JSONObject(new String(message.body, StandardCharsets.UTF_8)); int epoch = controlEpoch.get();
                if (pendingCommands.incrementAndGet() > 8) { pendingCommands.decrementAndGet(); throw new IllegalArgumentException("Too many pending commands"); }
                main.post(() -> {
                    try {
                        if (current(id) && epoch == controlEpoch.get() && canControl() && RemoteControlService.instance != null) RemoteControlService.instance.execute(command);
                        else if (current(id)) remoteMessage("The host must share its unlocked screen and allow remote control first.");
                    } finally { pendingCommands.decrementAndGet(); }
                });
            }
        } catch (Exception e) { disconnect(id, "Remote phone disconnected. Sharing and control have stopped."); }
    }
    private void receiveController(int id, SecureChannel secure) throws Exception {
        long lastFrame = 0;
        while (current(id)) {
            SecureChannel.Message message = secure.read(); if (!current(id)) return;
            if (message.type == SecureChannel.PING) { if (message.body.length != 0) throw new IllegalArgumentException("Invalid heartbeat"); }
            else if (message.type == SecureChannel.FRAME) {
                long now = System.nanoTime(); if (now - lastFrame < 150_000_000L) continue; lastFrame = now;
                BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true;
                BitmapFactory.decodeByteArray(message.body, 0, message.body.length, bounds);
                if (bounds.outWidth < 1 || bounds.outHeight < 1 || bounds.outWidth > 1600 || bounds.outHeight > 1600 || (long) bounds.outWidth * bounds.outHeight > 2_560_000) throw new IllegalArgumentException("Invalid image dimensions");
                latestFrame.set(new PendingFrame(id, message.body));
                if (frameUiQueued.compareAndSet(false, true)) main.post(() -> {
                    frameUiQueued.set(false); PendingFrame frame = latestFrame.getAndSet(null); Listener target = listener;
                    if (frame != null && current(frame.generation) && target != null) target.onFrame(frame.generation, frame.jpeg);
                });
            } else if (message.type == SecureChannel.STATUS) {
                if (message.body.length > 8192) throw new IllegalArgumentException("Status too large");
                JSONObject data = new JSONObject(new String(message.body, StandardCharsets.UTF_8));
                update(id, s -> { s.capturing = data.optBoolean("capturing"); s.controlAllowed = data.optBoolean("control"); s.accessibilityEnabled = data.optBoolean("accessibility"); s.status = data.optString("message"); if (s.status.isEmpty()) s.status = s.capturing ? "Live · encrypted local connection" : "Connected. Host screen sharing is paused."; });
            } else throw new IllegalArgumentException("Unexpected message");
        }
    }
    public synchronized void setControlAllowed(boolean allowed) { setControlAllowed(allowed, generation()); }
    public synchronized void setControlAllowed(boolean allowed, int id) {
        if (!current(id)) return; controlEpoch.incrementAndGet();
        controlConsent = allowed && authenticated && state.capturing && "HOST".equals(state.role) && RemoteControlService.instance != null;
        update(s -> { s.controlAllowed = controlConsent; s.status = controlConsent ? "Remote control allowed. Stop sharing or turn this off to revoke immediately." : "Remote control is off."; }); sendStatus();
    }
    public synchronized void captureChanged(boolean active, int id) {
        if (!current(id)) return;
        if (!active) { controlConsent = false; controlEpoch.incrementAndGet(); }
        update(s -> { s.capturing = active; s.controlAllowed = controlConsent; s.status = active ? "Screen sharing is live. Allow remote control when you are ready." : "Screen sharing stopped. Remote control revoked."; }); sendStatus();
    }
    public synchronized void sendFrame(byte[] jpeg, int id) {
        if (!current(id) || !isCapturing() || !frameBusy.compareAndSet(false, true)) return;
        SecureChannel secure = channel; if (secure == null) { frameBusy.set(false); return; }
        enqueue(id, () -> {
            try { if (current(id) && isCapturing()) secure.send(SecureChannel.FRAME, jpeg); }
            catch (Exception e) { disconnect(id, "Connection lost. Sharing and control stopped."); }
            finally { frameBusy.set(false); }
        });
    }
    private synchronized void sendStatus() {
        if (!authenticated || !"HOST".equals(state.role)) return;
        try { sendPacket(SecureChannel.STATUS, new JSONObject().put("capturing", state.capturing).put("control", controlConsent).put("accessibility", RemoteControlService.instance != null).toString().getBytes(StandardCharsets.UTF_8)); }
        catch (Exception e) { report("Could not send session status."); }
    }
    public synchronized void remoteMessage(String message) {
        try { sendPacket(SecureChannel.STATUS, new JSONObject().put("capturing", state.capturing).put("control", controlConsent).put("accessibility", RemoteControlService.instance != null).put("message", message).toString().getBytes(StandardCharsets.UTF_8)); }
