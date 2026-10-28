package com.synced.app.model

import android.graphics.Bitmap

enum class Role { IDLE, HOST, CONTROLLER }
data class UiState(
    val role: Role = Role.IDLE,
    val status: String = "Ready for a connection you approve.",
    val invitation: String = "",
    val addresses: String = "",
    val pendingPeer: String? = null,
    val connected: Boolean = false,
    val capturing: Boolean = false,
    val accessibilityEnabled: Boolean = false,
    val controlAllowed: Boolean = false,
    val peerName: String = "",
    val remoteFrame: Bitmap? = null,
    val error: String? = null
)
interface UiActions {
    fun startHosting()
    fun connect(invitation: String)
    fun approvePeer()
    fun rejectPeer()
    fun startScreenSharing()
    fun openAccessibilitySettings()
    fun setControlAllowed(allowed: Boolean)
    fun disconnect()
    fun sendGesture(startX: Float, startY: Float, endX: Float, endY: Float, durationMs: Long)
    fun sendText(text: String)
    /** Supported: back, home, recents, alarms, dismiss_alarm, snooze_alarm. */
    fun sendAction(action: String)
}
