package com.synced.app.control

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.app.KeyguardManager
import android.content.Intent
import android.graphics.Path
import android.os.Bundle
import android.provider.AlarmClock
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.WindowManager
import android.util.DisplayMetrics
import com.synced.app.AppSession
import org.json.JSONObject

class RemoteControlService : AccessibilityService() {
    companion object { @Volatile var instance: RemoteControlService? = null; private set }
    override fun onServiceConnected() { instance = this; AppSession.refreshAccessibility() }
    override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit
    override fun onInterrupt() = Unit
    override fun onDestroy() {
        instance = null
        AppSession.setControlAllowed(false)
        AppSession.refreshAccessibility()
        super.onDestroy()
    }
    fun execute(command: JSONObject) {
        if (!AppSession.canControl()) return
        val keyguard = getSystemService(KeyguardManager::class.java)
        if (keyguard.isKeyguardLocked) { fail("Unlock the host locally to continue."); return }
        try {
            when (command.getString("kind")) {
                "gesture" -> if (safeTarget()) gesture(command)
                "text" -> if (safeTarget()) typeText(command.getString("text"))
                "action" -> action(command.getString("action"))
                else -> fail("Unsupported command.")
            }
        } catch (_: Exception) { fail("The requested action is unavailable on this screen.") }
    }
    /** Never let a remote gesture grant permissions, approve a peer, or alter Synced's controls. */
    private fun safeTarget(): Boolean {
        val target = rootInActiveWindow?.packageName?.toString() ?: return false
        val blocked = target == packageName || target.contains(".settings") || target.contains("permissioncontroller") ||
            target.contains("packageinstaller") || target == "com.android.systemui" || target.contains("securitycenter")
        if (blocked) fail("This protected screen requires interaction on the host phone.")
        return !blocked
    }
    @Suppress("DEPRECATION") private fun gesture(data: JSONObject) {
        val sx = data.getDouble("sx"); val sy = data.getDouble("sy")
        val ex = data.getDouble("ex"); val ey = data.getDouble("ey")
        require(listOf(sx, sy, ex, ey).all { it.isFinite() && it in 0.0..1.0 })
        val duration = data.getLong("duration").coerceIn(50, 1500)
        val metrics = DisplayMetrics()
        (getSystemService(WINDOW_SERVICE) as WindowManager).defaultDisplay.getRealMetrics(metrics)
        val path = Path().apply {
            moveTo((sx * (metrics.widthPixels - 1)).toFloat(), (sy * (metrics.heightPixels - 1)).toFloat())
            if (sx != ex || sy != ey) lineTo((ex * (metrics.widthPixels - 1)).toFloat(), (ey * (metrics.heightPixels - 1)).toFloat())
        }
        val gesture = GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(path, 0, duration)).build()
        if (!dispatchGesture(gesture, null, null)) fail("Android could not perform this gesture.")
    }
    private fun typeText(text: String) {
        require(text.length in 1..1000)
