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
                case "text": if (safeTarget()) typeText(command.getString("text")); break;
                case "action": action(command.getString("action")); break;
                default: fail("Unsupported command.");
            }
        } catch (Exception e) { fail("The requested action is unavailable on this screen."); }
    }
    private boolean safeTarget() {
        AccessibilityNodeInfo root = getRootInActiveWindow(); if (root == null || root.getPackageName() == null) return false;
        String target = root.getPackageName().toString();
        boolean blocked = target.equals(getPackageName()) || target.contains(".settings") || target.contains("permissioncontroller") || target.contains("packageinstaller") || target.equals("com.android.systemui") || target.contains("securitycenter");
        if (blocked) fail("This protected screen requires interaction on the host phone."); return !blocked;
    }
    @SuppressWarnings("deprecation") private void gesture(JSONObject data) throws Exception {
        double sx = data.getDouble("sx"), sy = data.getDouble("sy"), ex = data.getDouble("ex"), ey = data.getDouble("ey");
        for (double value : new double[] {sx, sy, ex, ey}) if (!Double.isFinite(value) || value < 0 || value > 1) throw new IllegalArgumentException("Invalid coordinates");
        long duration = Math.max(50, Math.min(1500, data.getLong("duration")));
        DisplayMetrics metrics = new DisplayMetrics(); ((WindowManager) getSystemService(WINDOW_SERVICE)).getDefaultDisplay().getRealMetrics(metrics);
        Path path = new Path(); path.moveTo((float) (sx * (metrics.widthPixels - 1)), (float) (sy * (metrics.heightPixels - 1)));
        if (sx != ex || sy != ey) path.lineTo((float) (ex * (metrics.widthPixels - 1)), (float) (ey * (metrics.heightPixels - 1)));
        GestureDescription gesture = new GestureDescription.Builder().addStroke(new GestureDescription.StrokeDescription(path, 0, duration)).build();
        if (!dispatchGesture(gesture, null, null)) fail("Android could not perform this gesture.");
    }
    private void typeText(String text) {
        if (text.isEmpty() || text.length() > 1000) throw new IllegalArgumentException("Invalid text length");
        AccessibilityNodeInfo root = getRootInActiveWindow(), focused = root == null ? null : root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        if (focused == null || !focused.isEditable() || focused.isPassword()) { fail("Tap a normal editable field first. Password fields require local input."); return; }
        Bundle args = new Bundle(); args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
        if (!focused.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) fail("This app does not accept accessibility text input.");
    }
    private void action(String value) {
        Integer global = value.equals("back") ? GLOBAL_ACTION_BACK : value.equals("home") ? GLOBAL_ACTION_HOME : value.equals("recents") ? GLOBAL_ACTION_RECENTS : null;
        if (global != null) { if (!performGlobalAction(global)) fail("Android could not perform this navigation action."); return; }
        if (!safeTarget()) return;
        Intent intent;
        switch (value) {
            case "alarms": intent = new Intent(AlarmClock.ACTION_SHOW_ALARMS); break;
            case "dismiss_alarm": intent = new Intent(AlarmClock.ACTION_DISMISS_ALARM); break;
            case "snooze_alarm": intent = new Intent(AlarmClock.ACTION_SNOOZE_ALARM); break;
            default:
                if (!value.startsWith("set_alarm:")) { fail("Unsupported action."); return; }
                String[] parts = value.split(":"); if (parts.length != 3) throw new IllegalArgumentException("Invalid alarm");
                int hour = Integer.parseInt(parts[1]), minute = Integer.parseInt(parts[2]);
                if (hour < 0 || hour > 23 || minute < 0 || minute > 59) throw new IllegalArgumentException("Invalid alarm time");
                intent = new Intent(AlarmClock.ACTION_SET_ALARM).putExtra(AlarmClock.EXTRA_HOUR, hour).putExtra(AlarmClock.EXTRA_MINUTES, minute).putExtra(AlarmClock.EXTRA_MESSAGE, "Synced").putExtra(AlarmClock.EXTRA_SKIP_UI, false);
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { startActivity(intent); engine.remoteMessage("Alarm action sent to the host clock app. Confirm the visible result."); }
        catch (Exception e) { fail("No compatible clock app handled this alarm action."); }
    }
    private void fail(String message) { engine.remoteMessage(message); }
}
