package com.synced.app.network

import java.nio.ByteBuffer
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/** Version-one protocol primitives. The invitation secret is never sent over the socket. */
object Crypto {
    private val random = SecureRandom()
    fun randomBytes(size: Int): ByteArray = ByteArray(size).also(random::nextBytes)
    fun seal(key: ByteArray, plain: ByteArray): ByteArray {
        val nonce = randomBytes(12)
        return nonce + crypt(Cipher.ENCRYPT_MODE, key, nonce, plain, "Synced handshake v1".toByteArray())
    }
    fun open(key: ByteArray, sealed: ByteArray): ByteArray {
        require(sealed.size >= 28) { "Truncated authentication packet" }
        return crypt(Cipher.DECRYPT_MODE, key, sealed.copyOfRange(0, 12), sealed.copyOfRange(12, sealed.size), "Synced handshake v1".toByteArray())
    }
    fun derive(secret: ByteArray, clientNonce: ByteArray, hostNonce: ByteArray, direction: String): ByteArray {
        require(secret.size == 32 && clientNonce.size == 32 && hostNonce.size == 32)
        val extract = hmac(clientNonce + hostNonce, secret)
        return hmac(extract, "Synced v1 $direction".toByteArray() + byteArrayOf(1))
    }
    private fun hmac(key: ByteArray, value: ByteArray): ByteArray = Mac.getInstance("HmacSHA256").run {
        init(SecretKeySpec(key, "HmacSHA256")); doFinal(value)
    }
    internal fun crypt(mode: Int, key: ByteArray, nonce: ByteArray, data: ByteArray, aad: ByteArray): ByteArray =
        Cipher.getInstance("AES/GCM/NoPadding").run {
            init(mode, SecretKeySpec(key, "AES"), GCMParameterSpec(128, nonce))
            updateAAD(aad)
            doFinal(data)
        }
}

/** A key is unique per connection and direction; counters never repeat and replay closes the session. */
class PacketCipher(private val key: ByteArray) {
    private var nextSend = 0L
    private var nextReceive = 0L
    @Synchronized fun encrypt(plain: ByteArray): ByteArray {
        require(plain.size <= MAX_PLAIN_BYTES) { "Packet too large" }
        check(nextSend < Long.MAX_VALUE) { "Session exhausted" }
        val sequence = ByteBuffer.allocate(8).putLong(nextSend++).array()
        val nonce = ByteArray(4) + sequence
        return sequence + Crypto.crypt(Cipher.ENCRYPT_MODE, key, nonce, plain, sequence)
    }
    @Synchronized fun decrypt(packet: ByteArray): ByteArray {
        require(packet.size in 24..MAX_PACKET_BYTES) { "Invalid packet size" }
        val sequence = packet.copyOfRange(0, 8)
        require(ByteBuffer.wrap(sequence).long == nextReceive) { "Out-of-order or replayed packet" }
        val result = Crypto.crypt(Cipher.DECRYPT_MODE, key, ByteArray(4) + sequence, packet.copyOfRange(8, packet.size), sequence)
        nextReceive++
        return result
    }
    companion object {
        const val MAX_PLAIN_BYTES = 2 * 1024 * 1024
        const val MAX_PACKET_BYTES = MAX_PLAIN_BYTES + 24
    }
}
