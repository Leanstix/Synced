package com.synced.app.network

import java.util.Base64
import org.json.JSONObject
import java.net.InetAddress

/** Entire invitation is a bearer secret; never log it, persist it, or place it in a public link. */
data class Invitation(val host: String, val port: Int, val secret: ByteArray, val expires: Long) {
    fun encode(): String = "synced1:" + encodeBytes(JSONObject().put("host", host).put("port", port)
        .put("key", encodeBytes(secret)).put("expires", expires).toString().toByteArray())
