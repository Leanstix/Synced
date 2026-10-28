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
