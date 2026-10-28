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
        updateCurrent(id) { it.copy(role = Role.HOST, status = "Creating a private local invitation…", error = null) }
        io.execute {
            try {
                val candidates = NetworkInterface.getNetworkInterfaces().toList().filter { it.isUp && !it.isLoopback }
                    .sortedBy { if (it.name.startsWith("wlan") || it.name.startsWith("ap") || it.name.startsWith("swlan")) 0 else 1 }
                    .flatMap { net -> net.inetAddresses.toList().filterIsInstance<Inet4Address>() }
                    .filter { it.isSiteLocalAddress || it.isLinkLocalAddress }.mapNotNull { it.hostAddress }.distinct()
                require(candidates.isNotEmpty()) { "Connect both phones to the same Wi-Fi or turn on a phone's hotspot first." }
                val localServer = ServerSocket(0).apply { soTimeout = 1000 }
                if (!claimServer(id, localServer)) return@execute
                val secret = Crypto.randomBytes(32)
                val expiry = System.currentTimeMillis() + 10 * 60_000
                val invitation = Invitation(candidates.first(), localServer.localPort, secret, expiry).encode()
                updateCurrent(id) { it.copy(invitation = invitation, addresses = "${candidates.first()}:${localServer.localPort}", status = "Invitation ready for 10 minutes. Keep it private; approve the connecting phone here.") }
                while (isCurrent(id) && System.currentTimeMillis() < expiry) {
                    val accepted = try { localServer.accept() } catch (_: SocketTimeoutException) { continue }
                    if (!claimSocket(id, accepted)) return@execute
                    try {
                        accepted.soTimeout = 12_000
                        accepted.tcpNoDelay = true
                        val (secure, peer) = Pairing.host(accepted, secret) { name ->
                            val gate = ApprovalGate()
                            synchronized(this) {
                                if (isCurrent(id)) {
                                    pendingApproval = gate
                                    updateCurrent(id) { it.copy(pendingPeer = name, status = "Compare this code with the connecting phone before approving.") }
                                } else gate.resolve(false)
                            }
                            val allowed = gate.await(90, TimeUnit.SECONDS)
                            synchronized(this) {
                                if (pendingApproval === gate) pendingApproval = null
                                isCurrent(id) && allowed && System.currentTimeMillis() < expiry
                            }
                        }
                        if (!isCurrent(id)) { accepted.close(); return@execute }
                        localServer.close()
                        synchronized(this) { if (isCurrent(id)) server = null }
                        if (!activate(id, secure)) { accepted.close(); return@execute }
                        accepted.soTimeout = 15_000
                        updateCurrent(id) { it.copy(connected = true, pendingPeer = null, invitation = "", peerName = peer,
                            status = "Phone approved. Start screen sharing when you are ready.", error = null) }
                        sendStatus()
                        receiveHost(id, secure)
                        return@execute
                    } catch (e: Exception) {
                        accepted.close()
                        if (isCurrent(id)) updateCurrent(id) { it.copy(pendingPeer = null, status = "Connection declined or authentication failed. Share the invitation only with your intended phone.", error = null) }
                    }
                }
                disconnectCurrent(id, "Invitation expired. Create a new invitation to host.")
            } catch (e: Exception) {
                disconnectCurrent(id, "Could not host: ${friendly(e)}")
            }
        }
    }
    @Synchronized fun approvePeer(allow: Boolean) {
        val id = generation.get()
        if (pendingApproval == null) return
        pendingApproval?.resolve(allow)
        updateCurrent(id) { it.copy(pendingPeer = null, status = if (allow) "Phone approved. Establishing encrypted session…" else "Connection declined.") }
    }
    fun connect(text: String) {
        disconnect()
        val id = generation.get()
        updateCurrent(id) { it.copy(role = Role.CONTROLLER, status = "Connecting securely. Approve this phone on the host…", error = null) }
        io.execute {
            try {
                val invite = Invitation.parse(text)
                val client = Socket()
                if (!claimSocket(id, client)) return@execute
                client.connect(InetSocketAddress(invite.host, invite.port), 8000)
                client.soTimeout = 100_000; client.tcpNoDelay = true
                val (secure, peer) = Pairing.controller(client, invite.secret) { code ->
                    if (isCurrent(id)) updateCurrent(id) { it.copy(status = "Pairing code $code · Compare on the host, then approve there.") }
                }
                if (!isCurrent(id)) { client.close(); return@execute }
                if (!activate(id, secure)) { client.close(); return@execute }
                client.soTimeout = 15_000
                updateCurrent(id) { it.copy(connected = true, peerName = peer, status = "Connected. Waiting for the host to start screen sharing.", error = null) }
                receiveController(id, secure)
            } catch (e: Exception) {
                disconnectCurrent(id, "Connection ended: ${friendly(e)}")
            }
        }
    }
    private fun receiveHost(id: Int, secure: SecureChannel) {
        var commandWindow = System.nanoTime()
        var commands = 0
        try {
            while (isCurrent(id)) {
                val (type, bytes) = secure.read()
                if (type == SecureChannel.PING) { require(bytes.isEmpty()); continue }
                require(type == SecureChannel.CONTROL && bytes.size <= 8192) { "Unexpected command" }
                val now = System.nanoTime()
