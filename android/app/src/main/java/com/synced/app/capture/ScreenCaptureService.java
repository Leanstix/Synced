package com.synced.app.capture;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.*;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import com.synced.app.MainActivity;
import com.synced.app.core.SessionEngine;
import java.io.ByteArrayOutputStream;

/** Explicit, foreground, full-display capture. Permission tokens are never reused. */
public final class ScreenCaptureService extends Service {
    private final HandlerThread worker = new HandlerThread("Synced capture");
    private Handler handler;
    private SessionEngine engine;
    private MediaProjection projection;
    private VirtualDisplay display;
    private ImageReader reader;
    private int width, height, density, sessionId = -1;
    private long lastFrame;
    private volatile boolean stopping;
    private boolean screenReceiverRegistered;
    private final BroadcastReceiver screenReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (Intent.ACTION_SCREEN_OFF.equals(intent.getAction())) { engine.disconnect(sessionId, "Host screen turned off. Sharing and control stopped."); stopSelf(); }
        }
    };
    private final DisplayManager.DisplayListener displayListener = new DisplayManager.DisplayListener() {
        public void onDisplayAdded(int id) {}
        public void onDisplayRemoved(int id) {}
        public void onDisplayChanged(int id) { if (Build.VERSION.SDK_INT < 34) { DisplayMetrics full = metrics(); resize(full.widthPixels, full.heightPixels); } }
    };
    private final MediaProjection.Callback callback = new MediaProjection.Callback() {
        @Override public void onStop() { stopSelf(); }
        @Override public void onCapturedContentResize(int w, int h) {
            engine.setControlAllowed(false, sessionId);
            handler.postDelayed(() -> {
                if (stopping || sessionId != engine.generation()) return;
                DisplayMetrics full = metrics();
                if (w != full.widthPixels || h != full.heightPixels) { engine.report(sessionId, "Full-display sharing is required. Select the entire screen and start sharing again."); stopSelf(); }
                else resize(w, h);
            }, 180);
        }
    };
    @Override public void onCreate() { super.onCreate(); engine = SessionEngine.get(this); worker.start(); handler = new Handler(worker.getLooper()); }
    @Override public IBinder onBind(Intent intent) { return null; }
