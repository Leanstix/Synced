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
