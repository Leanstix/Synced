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
