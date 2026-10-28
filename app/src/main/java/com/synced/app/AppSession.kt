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
    @Synchronized private fun update(change: (UiState) -> UiState) {
        state = change(state)
        // Render the newest state once per main-loop turn; do not retain a backlog of frame bitmaps.
        if (uiUpdateQueued.compareAndSet(false, true)) main.post {
            uiUpdateQueued.set(false)
            listener?.invoke(state)
        }
    }
    fun report(message: String) { update { it.copy(status = message, error = message) } }
    fun refreshAccessibility() {
        if (state.role == Role.CONTROLLER) return
        update { it.copy(accessibilityEnabled = RemoteControlService.instance != null) }
        sendStatus()
    }
    @Synchronized fun disconnect(message: String = "Disconnected. Create a fresh invitation to pair again.") {
        generation.incrementAndGet()
        authenticated = false
        controlConsent = false
        controlEpoch.incrementAndGet()
        pendingApproval?.resolve(false); pendingApproval = null
        runCatching { socket?.close() }; socket = null
        runCatching { server?.close() }; server = null
        channel = null
        if (::context.isInitialized) context.stopService(Intent(context, ScreenCaptureService::class.java))
        update { UiState(status = message, accessibilityEnabled = RemoteControlService.instance != null) }
    }
    @Synchronized fun disconnectCurrent(id: Int, message: String) {
        if (isCurrent(id)) disconnect(message)
    }
    fun currentGeneration(): Int = generation.get()
    @Synchronized private fun updateCurrent(id: Int, change: (UiState) -> UiState) {
        if (isCurrent(id)) update(change)
    }
    @Synchronized private fun claimSocket(id: Int, value: Socket): Boolean {
        if (!isCurrent(id)) { value.close(); return false }
        socket = value; return true
    }
    @Synchronized private fun claimServer(id: Int, value: ServerSocket): Boolean {
        if (!isCurrent(id)) { value.close(); return false }
        server = value; return true
    }
    @Synchronized private fun activate(id: Int, value: SecureChannel): Boolean {
        if (!isCurrent(id)) return false
        channel = value; authenticated = true; return true
    }
    private fun isCurrent(id: Int) = generation.get() == id
    fun startHosting() {
        disconnect()
        val id = generation.get()
