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
            else @Suppress("DEPRECATION") registerReceiver(screenReceiver, IntentFilter(Intent.ACTION_SCREEN_OFF))
            screenReceiverRegistered = true
            val resultCode = intent.getIntExtra("resultCode", Activity.RESULT_CANCELED)
            val data = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra("data", Intent::class.java) else @Suppress("DEPRECATION") (intent.getParcelableExtra("data") as? Intent)
            require(resultCode == Activity.RESULT_OK && data != null)
            projection = getSystemService(MediaProjectionManager::class.java).getMediaProjection(resultCode, data)
            projection!!.registerCallback(callback, handler)
            handler.post {
                try {
                    val metrics = realMetrics(); density = metrics.densityDpi
                    val dimensions = scaled(metrics.widthPixels, metrics.heightPixels)
                    width = dimensions.first; height = dimensions.second
                    reader = makeReader(width, height)
                    display = projection!!.createVirtualDisplay("Synced screen", width, height, density,
                        DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader!!.surface, null, handler)
                    getSystemService(DisplayManager::class.java).registerDisplayListener(displayListener, handler)
                    AppSession.captureChanged(true, sessionId)
                } catch (_: Exception) { AppSession.report("Screen capture could not start. Grant a fresh sharing session."); stopSelf() }
            }
        } catch (_: Exception) { AppSession.report("Screen sharing permission was unavailable. Try sharing again."); stopSelf() }
        return START_NOT_STICKY
    }
    private fun createNotification() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("sharing", "Active screen sharing", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 1, Intent(this, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 2, Intent(this, ScreenCaptureService::class.java).setAction("STOP"), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = Notification.Builder(this, "sharing").setSmallIcon(android.R.drawable.ic_menu_view)
            .setContentTitle("Synced · your screen is being shared")
            .setContentText("One approved phone can view this screen. Tap Stop to revoke.")
            .setContentIntent(open).setOngoing(true).setCategory(Notification.CATEGORY_SERVICE)
            .addAction(Notification.Action.Builder(null, "Stop & revoke", stop).build()).build()
        if (Build.VERSION.SDK_INT >= 29) startForeground(11, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        else startForeground(11, notification)
    }
    @Suppress("DEPRECATION") private fun realMetrics(): DisplayMetrics = DisplayMetrics().also {
        (getSystemService(WINDOW_SERVICE) as WindowManager).defaultDisplay.getRealMetrics(it)
    }
    private fun scaled(w: Int, h: Int): Pair<Int, Int> {
        require(w > 0 && h > 0)
