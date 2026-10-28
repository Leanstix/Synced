package com.synced.app.core;

import android.app.Activity;
import android.content.Intent;
import android.media.projection.MediaProjectionConfig;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.provider.Settings;
import android.util.Base64;
import com.facebook.react.bridge.*;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.synced.app.capture.ScreenCaptureService;
import org.json.JSONObject;
import java.util.Iterator;
import java.util.concurrent.atomic.AtomicBoolean;

/** React Native bridge for platform APIs; the application UI and action validation live in TypeScript. */
public final class SyncedModule extends ReactContextBaseJavaModule implements ActivityEventListener, LifecycleEventListener, SessionEngine.Listener {
    public static final String NAME = "Synced";
    private static final int CAPTURE_REQUEST = 700;
    private final SessionEngine engine;
    private volatile boolean uiActive = true;
    private int captureGeneration = -1;
    private boolean capturePending;
    private final AtomicBoolean frameAwaitingAck = new AtomicBoolean();
    public SyncedModule(ReactApplicationContext context) {
        super(context); engine = SessionEngine.get(context); context.addActivityEventListener(this); context.addLifecycleEventListener(this); engine.setListener(this);
    }
    @Override public String getName() { return NAME; }
    @ReactMethod public void getState(Promise promise) { promise.resolve(map(engine.snapshot())); }
    @ReactMethod public void startHosting() { engine.startHosting(); }
    @ReactMethod public void connect(String invitation) { engine.connect(invitation); }
    @ReactMethod public void approvePeer(boolean allow) { engine.approve(allow); }
    @ReactMethod public void disconnect() { engine.disconnect("Disconnected. Create a fresh invitation to pair again."); }
    @ReactMethod public void setControlAllowed(boolean allowed) { engine.setControlAllowed(allowed); }
    @ReactMethod public void openAccessibilitySettings() {
        UiThreadUtil.runOnUiThread(() -> {
            Activity activity = getReactApplicationContext().getCurrentActivity();
            if (activity != null) activity.startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
            else engine.report("Open Synced on the host before enabling accessibility.");
        });
    }
    @ReactMethod public void startCapture() {
        UiThreadUtil.runOnUiThread(() -> {
            if (capturePending) return;
            Activity activity = getReactApplicationContext().getCurrentActivity();
            if (activity == null || !engine.isHostReady()) { engine.report("Approve a connected phone on the host before sharing."); return; }
            captureGeneration = engine.generation();
            try {
                MediaProjectionManager manager = activity.getSystemService(MediaProjectionManager.class);
                Intent capture = Build.VERSION.SDK_INT >= 34 ? manager.createScreenCaptureIntent(MediaProjectionConfig.createConfigForDefaultDisplay()) : manager.createScreenCaptureIntent();
                capturePending = true; activity.startActivityForResult(capture, CAPTURE_REQUEST);
            } catch (Exception e) { capturePending = false; engine.report(captureGeneration, "Android could not open screen-sharing consent."); }
        });
    }
    @Override public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {
        if (requestCode != CAPTURE_REQUEST) return;
        capturePending = false;
        if (resultCode == Activity.RESULT_OK && data != null && captureGeneration == engine.generation() && engine.isHostReady()) {
            try { activity.startForegroundService(new Intent(activity, ScreenCaptureService.class).putExtra("resultCode", resultCode).putExtra("data", data).putExtra("generation", captureGeneration)); }
            catch (Exception e) { engine.report(captureGeneration, "Android could not start foreground sharing. Keep Synced open and try again."); }
        } else engine.report(captureGeneration, "Screen sharing was not started. Your screen remains private.");
    }
    @Override public void onNewIntent(Intent intent) {}
    @Override public void onUserLeaveHint(Activity activity) {}
    @ReactMethod public void sendGesture(double sx, double sy, double ex, double ey, double duration) {
        try {
            for (double value : new double[] {sx, sy, ex, ey}) if (!Double.isFinite(value) || value < 0 || value > 1) throw new IllegalArgumentException();
            if (!Double.isFinite(duration)) throw new IllegalArgumentException();
            engine.command(new JSONObject().put("kind", "gesture").put("sx", sx).put("sy", sy).put("ex", ex).put("ey", ey).put("duration", Math.max(50, Math.min(1500, (long) duration))));
        } catch (Exception e) { engine.report("Invalid remote gesture."); }
    }
    @ReactMethod public void sendText(String text) {
        try { if (text == null || text.isEmpty() || text.length() > 1000) return; engine.command(new JSONObject().put("kind", "text").put("text", text)); }
        catch (Exception e) { engine.report("Invalid remote text."); }
    }
    @ReactMethod public void sendAction(String action) {
        try { engine.command(new JSONObject().put("kind", "action").put("action", action)); }
        catch (Exception e) { engine.report("Invalid remote action."); }
    }
    @Override public void onState(JSONObject state) {
        if (uiActive && getReactApplicationContext().hasActiveReactInstance()) emit("SyncedState", map(state));
    }
    @ReactMethod public void ackFrame() { frameAwaitingAck.set(false); }
    @Override public void onFrame(int sessionId, byte[] jpeg) {
        if (!uiActive || !getReactApplicationContext().hasActiveReactInstance() || !frameAwaitingAck.compareAndSet(false, true)) return;
        WritableMap event = Arguments.createMap(); event.putInt("sessionId", sessionId); event.putString("uri", "data:image/jpeg;base64," + Base64.encodeToString(jpeg, Base64.NO_WRAP)); emit("SyncedFrame", event);
    }
    private void emit(String name, WritableMap value) {
        getReactApplicationContext().getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class).emit(name, value);
    }
    private static WritableMap map(JSONObject json) {
