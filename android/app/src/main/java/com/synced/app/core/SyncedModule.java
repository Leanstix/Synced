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
