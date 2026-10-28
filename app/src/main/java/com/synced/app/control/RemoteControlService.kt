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
