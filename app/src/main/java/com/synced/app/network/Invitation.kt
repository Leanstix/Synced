package com.synced.app.network

import java.util.Base64
import org.json.JSONObject
import java.net.InetAddress

/** Entire invitation is a bearer secret; never log it, persist it, or place it in a public link. */
data class Invitation(val host: String, val port: Int, val secret: ByteArray, val expires: Long) {
    fun encode(): String = "synced1:" + encodeBytes(JSONObject().put("host", host).put("port", port)
        .put("key", encodeBytes(secret)).put("expires", expires).toString().toByteArray())
    companion object {
        fun encodeBytes(bytes: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
        fun decodeBytes(text: String): ByteArray = Base64.getUrlDecoder().decode(text)
        fun parse(text: String): Invitation {
            require(text.trim().startsWith("synced1:")) { "Paste the complete Synced invitation." }
            require(text.length < 4096) { "Invitation is too long." }
            val data = JSONObject(String(decodeBytes(text.trim().removePrefix("synced1:"))))
            val host = data.getString("host")
