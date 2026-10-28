package com.synced.app.network

import android.os.Build
import org.json.JSONObject
import java.io.DataInputStream
import java.io.DataOutputStream
import java.net.Socket
import java.security.MessageDigest

object Pairing {
    private const val MAX_HANDSHAKE = 4096
    private fun send(socket: Socket, secret: ByteArray, json: JSONObject) =
        Framing.write(DataOutputStream(socket.getOutputStream()), Crypto.seal(secret, json.toString().toByteArray()), MAX_HANDSHAKE)
    private fun receive(socket: Socket, secret: ByteArray): JSONObject =
        JSONObject(String(Crypto.open(secret, Framing.read(DataInputStream(socket.getInputStream()), MAX_HANDSHAKE))))
    private fun nonce(json: JSONObject, key: String): ByteArray = Invitation.decodeBytes(json.getString(key)).also { require(it.size == 32) }
    private fun name(): String = "${Build.MANUFACTURER} ${Build.MODEL}".take(80)
    private fun verificationCode(secret: ByteArray, client: ByteArray, host: ByteArray): String {
        val bytes = Crypto.derive(secret, client, host, "verification code")
