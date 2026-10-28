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
