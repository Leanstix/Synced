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
