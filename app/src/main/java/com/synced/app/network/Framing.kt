package com.synced.app.network

import java.io.DataInputStream
import java.io.DataOutputStream

object Framing {
    fun read(input: DataInputStream, max: Int = PacketCipher.MAX_PACKET_BYTES): ByteArray {
        val size = input.readInt()
        require(size in 1..max) { "Invalid frame length" }
        return ByteArray(size).also(input::readFully)
