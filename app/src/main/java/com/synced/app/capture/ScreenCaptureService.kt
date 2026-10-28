package com.synced.app.capture

import android.app.*
import android.content.Intent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.*
import android.util.DisplayMetrics
import android.view.WindowManager
import com.synced.app.AppSession
import com.synced.app.MainActivity
import com.synced.app.model.Role
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.roundToInt

class ScreenCaptureService : Service() {
    private val worker = HandlerThread("Synced capture")
    private lateinit var handler: Handler
    private var projection: MediaProjection? = null
    private var display: VirtualDisplay? = null
    private var reader: ImageReader? = null
    private var width = 0
    private var height = 0
    private var density = 0
    private var sessionId = -1
    private var screenReceiverRegistered = false
    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == Intent.ACTION_SCREEN_OFF) {
                AppSession.disconnectCurrent(sessionId, "Host screen turned off. Sharing and control have stopped.")
                stopSelf()
            }
        }
    }
    private var lastFrame = 0L
    @Volatile private var stopping = false
    private val displayListener = object : DisplayManager.DisplayListener {
        override fun onDisplayAdded(id: Int) = Unit
        override fun onDisplayRemoved(id: Int) = Unit
        override fun onDisplayChanged(id: Int) { if (Build.VERSION.SDK_INT < 34) resizeFromDisplay() }
    }
    private val callback = object : MediaProjection.Callback() {
        override fun onStop() { stopSelf() }
        override fun onCapturedContentResize(w: Int, h: Int) {
            // OEMs can override full-display capture. Never map remote touches into an app-only capture.
            AppSession.setControlAllowed(false, sessionId)
            handler.postDelayed({
                if (!stopping && sessionId == AppSession.currentGeneration()) {
                    val full = realMetrics()
                    if (w != full.widthPixels || h != full.heightPixels) {
                        AppSession.report("Full-display sharing is required. Select the entire screen and start sharing again.")
                        stopSelf()
                    } else resize(w, h)
                }
            }, 180)
        }
    }
    override fun onCreate() {
        super.onCreate()
        AppSession.initialize(this)
        worker.start(); handler = Handler(worker.looper)
    }
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "STOP") { AppSession.disconnect("Sharing stopped locally. Connection revoked."); stopSelf(); return START_NOT_STICKY }
        if (projection != null) return START_NOT_STICKY
        if (intent == null || AppSession.state.role != Role.HOST || !AppSession.state.connected) { stopSelf(); return START_NOT_STICKY }
        sessionId = intent.getIntExtra("generation", -1)
        if (sessionId != AppSession.currentGeneration()) { stopSelf(); return START_NOT_STICKY }
        try {
            createNotification()
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(screenReceiver, IntentFilter(Intent.ACTION_SCREEN_OFF), Context.RECEIVER_NOT_EXPORTED)
