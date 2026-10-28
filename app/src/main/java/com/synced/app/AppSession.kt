package com.synced.app

import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import com.synced.app.capture.ScreenCaptureService
import com.synced.app.control.RemoteControlService
import com.synced.app.model.Role
import com.synced.app.model.UiState
import com.synced.app.network.*
import org.json.JSONObject
import java.net.Inet4Address
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketTimeoutException
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/** Process-scoped session; no invitation, peer credential, frame, or typed text is persisted. */
object AppSession {
    private lateinit var context: Context
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newCachedThreadPool()
    private val outgoing = ThreadPoolExecutor(1, 1, 0, TimeUnit.SECONDS, ArrayBlockingQueue<Runnable>(32))
    private val heartbeat = Executors.newSingleThreadScheduledExecutor().apply {
        scheduleAtFixedRate({ if (authenticated) sendPacket(SecureChannel.PING, byteArrayOf()) }, 5, 5, TimeUnit.SECONDS)
    }
    private val generation = AtomicInteger()
    private val pendingCommands = AtomicInteger()
    private val controlEpoch = AtomicInteger()
    private val uiUpdateQueued = AtomicBoolean(false)
    private val frameBusy = AtomicBoolean(false)
    @Volatile private var listener: ((UiState) -> Unit)? = null
    @Volatile var state = UiState(); private set
    @Volatile private var server: ServerSocket? = null
    @Volatile private var socket: Socket? = null
    @Volatile private var channel: SecureChannel? = null
    @Volatile private var pendingApproval: ApprovalGate? = null
    @Volatile private var authenticated = false
    @Volatile private var controlConsent = false

    fun initialize(value: Context) { context = value.applicationContext }
    fun observe(value: ((UiState) -> Unit)?) { listener = value; value?.invoke(state) }
