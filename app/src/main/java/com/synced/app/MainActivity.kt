package com.synced.app

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionConfig
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import com.synced.app.capture.ScreenCaptureService
import com.synced.app.model.Role
import com.synced.app.model.UiActions
import com.synced.app.ui.SyncedUi
import org.json.JSONObject

class MainActivity : Activity(), UiActions {
    private lateinit var ui: SyncedUi
    private var captureGeneration = -1
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AppSession.initialize(this)
        captureGeneration = savedInstanceState?.getInt("captureGeneration", -1) ?: -1
        window.statusBarColor = 0xFF101518.toInt()
        window.navigationBarColor = 0xFF101518.toInt()
        ui = SyncedUi(this, this)
        setContentView(ui.root)
    }
    override fun onSaveInstanceState(outState: Bundle) {
        outState.putInt("captureGeneration", captureGeneration)
        super.onSaveInstanceState(outState)
    }
    override fun onResume() {
        super.onResume()
        AppSession.observe(ui::render)
        if (AppSession.state.role != Role.CONTROLLER) AppSession.refreshAccessibility()
    }
    override fun onPause() { AppSession.observe(null); super.onPause() }
    override fun startHosting() = AppSession.startHosting()
    override fun connect(invitation: String) = AppSession.connect(invitation)
    override fun approvePeer() = AppSession.approvePeer(true)
    override fun rejectPeer() = AppSession.approvePeer(false)
    override fun disconnect() = AppSession.disconnect()
    override fun setControlAllowed(allowed: Boolean) {
        if (!allowed) { AppSession.setControlAllowed(false); return }
        AlertDialog.Builder(this).setTitle("Allow this phone to control your screen?")
            .setMessage("The approved phone can tap, swipe, type into normal text fields, navigate, and open clock actions while sharing is active. Keep private apps closed. Android permission screens and Synced controls require local interaction. Stop sharing or switch control off to revoke immediately.")
            .setNegativeButton("Keep control off", null)
            .setPositiveButton("Allow control") { _, _ -> AppSession.setControlAllowed(true) }.show()
    }
    override fun openAccessibilitySettings() {
        AlertDialog.Builder(this).setTitle("Enable remote input on this phone")
            .setMessage("Synced uses Android's Accessibility service to perform only commands from your approved phone during an active screen-sharing session. It can read the focused field and screen package to type and protect sensitive screens. It does not unlock your phone. Enable Synced in Accessibility settings, then return here and allow control for this session. You can disable the service in Settings at any time.")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Open settings") { _, _ -> startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }.show()
    }
    override fun startScreenSharing() {
        if (!AppSession.state.connected || AppSession.state.role != Role.HOST || AppSession.state.capturing) return
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 701)
            return
        }
        requestCapture()
    }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 701) requestCapture()
    }
    private fun requestCapture() {
        if (!AppSession.state.connected || AppSession.state.role != Role.HOST || AppSession.state.capturing) return
        captureGeneration = AppSession.currentGeneration()
        val manager = getSystemService(MediaProjectionManager::class.java)
        val capture = if (Build.VERSION.SDK_INT >= 34) manager.createScreenCaptureIntent(MediaProjectionConfig.createConfigForDefaultDisplay()) else manager.createScreenCaptureIntent()
        @Suppress("DEPRECATION")
        startActivityForResult(capture, 700)
    }
    @Deprecated("Activity result API is retained to keep this app dependency-free")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != 700) return
        if (resultCode == RESULT_OK && data != null && captureGeneration == AppSession.currentGeneration() && AppSession.state.connected && AppSession.state.role == Role.HOST) {
