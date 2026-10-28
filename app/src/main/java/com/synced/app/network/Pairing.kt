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
        val number = java.nio.ByteBuffer.wrap(bytes).int.toLong() and 0xffffffffL
        return (number % 1_000_000).toString().padStart(6, '0')
    }
    fun host(socket: Socket, secret: ByteArray, approve: (String) -> Boolean): Pair<SecureChannel, String> {
        val hello = receive(socket, secret)
        require(hello.getString("type") == "hello" && hello.getInt("version") == 1)
        val clientNonce = nonce(hello, "nonce")
        val hostNonce = Crypto.randomBytes(32)
        val peer = hello.getString("name").filter { !it.isISOControl() }.take(80)
        send(socket, secret, JSONObject().put("type", "challenge").put("client", Invitation.encodeBytes(clientNonce))
            .put("host", Invitation.encodeBytes(hostNonce)).put("name", name()))
        val proof = receive(socket, secret)
        require(proof.getString("type") == "proof" && MessageDigest.isEqual(nonce(proof, "host"), hostNonce))
        val channel = SecureChannel(socket, Crypto.derive(secret, clientNonce, hostNonce, "host to controller"), Crypto.derive(secret, clientNonce, hostNonce, "controller to host"))
        require(approve("$peer · code ${verificationCode(secret, clientNonce, hostNonce)}")) { "Connection was declined or approval expired." }
        channel.send(SecureChannel.STATUS, JSONObject().put("approved", true).put("name", name()).toString().toByteArray())
        return channel to peer
