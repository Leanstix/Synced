package com.synced.app.control;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.app.KeyguardManager;
import android.content.Intent;
import android.graphics.Path;
import android.os.Bundle;
import android.provider.AlarmClock;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import com.synced.app.core.SessionEngine;
import org.json.JSONObject;

/** Platform-only accessibility adapter. The host's active session consent gates every operation. */
public final class RemoteControlService extends AccessibilityService {
    public static volatile RemoteControlService instance;
    private SessionEngine engine;
    @Override protected void onServiceConnected() { engine = SessionEngine.get(this); instance = this; engine.refreshAccessibility(); }
    @Override public void onAccessibilityEvent(AccessibilityEvent event) {}
    @Override public void onInterrupt() {}
    @Override public void onDestroy() { instance = null; if (engine != null) { engine.setControlAllowed(false); engine.refreshAccessibility(); } super.onDestroy(); }
    public void execute(JSONObject command) {
        if (engine == null || !engine.canControl()) return;
        if (getSystemService(KeyguardManager.class).isKeyguardLocked()) { fail("Unlock the host locally to continue."); return; }
        try {
            switch (command.getString("kind")) {
                case "gesture": if (safeTarget()) gesture(command); break;
